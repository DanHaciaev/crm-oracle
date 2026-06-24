import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import PDFDocument from "pdfkit";
import path from "path";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

type Row = Record<string, unknown>;
function s(v: unknown) { return v == null ? "" : String(v); }
function n(v: unknown) { return v == null ? 0 : Number(v); }
function fmt(x: number) { return x.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU");
}

const VAT_RATE = 0.20;

async function getConfig(keys: string[]): Promise<Record<string, string>> {
  try {
    const rows = await query<Row>(
      `SELECT CONFIG_KEY, CONFIG_VALUE FROM AGRO_MODULE_CONFIG WHERE CONFIG_KEY IN (${keys.map((_, i) => `:${i + 1}`).join(",")})`,
      keys
    );
    const out: Record<string, string> = {};
    for (const r of rows) out[s(r.CONFIG_KEY)] = s(r.CONFIG_VALUE);
    return out;
  } catch {
    return {};
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const [cfg, docRows, lineRows] = await Promise.all([
    getConfig(["company.name", "company.address", "company.fiscal_code", "company.iban"]),
    query<Row>(`
      SELECT sd.ID, sd.DOC_NUMBER, sd.DOC_DATE,
             sd.INVOICE_NUMBER,
             NVL(sd.TOTAL_AMOUNT, 0)     AS TOTAL_AMOUNT,
             NVL(sd.CURRENCY_CODE,'MDL') AS CURRENCY_CODE,
             c.NAME          AS CUSTOMER_NAME,
             c.TAX_ID        AS CUSTOMER_TAX,
             c.ADDRESS       AS CUSTOMER_ADDRESS
      FROM AGRO_SALES_DOCS sd
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      WHERE sd.ID = :1
    `, [docId]),
    query<Row>(`
      SELECT NVL(i.NAME_RU, i.NAME_RO) AS ITEM_NAME,
             NVL(i.UNIT, 'кг')         AS UNIT,
             NVL(sl.NET_WEIGHT_KG, 0)  AS QTY,
             NVL(sl.PRICE_PER_KG, 0)   AS PRICE,
             NVL(sl.AMOUNT, 0)         AS AMOUNT
      FROM AGRO_SALES_LINES sl
      JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
      WHERE sl.SALES_DOC_ID = :1
      ORDER BY sl.ID
    `, [docId]),
  ]);

  if (!docRows.length)
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });

  const doc  = docRows[0];
  const curr = s(doc.CURRENCY_CODE) || "MDL";

  const companyName   = cfg["company.name"]       || process.env.COMPANY_NAME || "AGRO Company SRL";
  const companyAddr   = cfg["company.address"]     || "";
  const companyFiscal = cfg["company.fiscal_code"] || "";
  const companyIban   = cfg["company.iban"]        || "";

  const fontDir = path.join(process.cwd(), "public", "fonts");
  // A4 = 595 × 842 pt, margin 35 each side → usable width = 525
  const pdf = new PDFDocument({ margin: 35, size: "A4" });
  pdf.registerFont("Regular", path.join(fontDir, "DejaVuSans.ttf"));
  pdf.registerFont("Bold",    path.join(fontDir, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve) => {
    pdf.on("end", resolve);

    const L = 35;   // left margin
    const R = 560;  // right margin  (595 - 35)
    const W = R - L; // 525

    // ── Company header ───────────────────────────────────────────────────────
    pdf.fontSize(9).font("Regular").fillColor("#555")
      .text(companyName, L, 35, { align: "center", width: W });
    pdf.moveDown(0.25);

    pdf.fontSize(15).font("Bold").fillColor("#000")
      .text("СЧЁТ-ФАКТУРА / FACTURA FISCALĂ", { align: "center", width: W });
    pdf.moveDown(0.3);

    const docNum = s(doc.INVOICE_NUMBER) || s(doc.DOC_NUMBER);
    pdf.fontSize(9).font("Regular")
      .text(`Серия AGR  №: ${docNum}    Дата / Data: ${fmtDate(doc.DOC_DATE)}`, { align: "center", width: W });

    pdf.moveDown(0.6);
    pdf.moveTo(L, pdf.y).lineTo(R, pdf.y).lineWidth(1.5).stroke("#000");
    pdf.moveDown(0.5);

    // ── Parties block ────────────────────────────────────────────────────────
    const partyW = (W - 8) / 2;  // ~258 each
    const partyY = pdf.y;
    const pH = 70;

    function party(x: number, title: string, name: string, addr: string, fiscal: string, iban: string) {
      pdf.rect(x, partyY, partyW, pH).lineWidth(0.5).stroke("#aaa");
      pdf.fontSize(7).font("Bold").fillColor("#777")
        .text(title, x + 6, partyY + 5, { width: partyW - 12 });
      pdf.fontSize(9).font("Bold").fillColor("#000")
        .text(name || "—", x + 6, partyY + 16, { width: partyW - 12, lineBreak: false });
      pdf.fontSize(8).font("Regular").fillColor("#333");
      let ty = partyY + 28;
      if (addr)   { pdf.text(addr,               x + 6, ty, { width: partyW - 12, lineBreak: false }); ty += 11; }
      if (fiscal) { pdf.text(`Cod fiscal: ${fiscal}`, x + 6, ty, { width: partyW - 12, lineBreak: false }); ty += 11; }
      if (iban)   { pdf.text(`IBAN: ${iban}`,      x + 6, ty, { width: partyW - 12, lineBreak: false }); }
    }

    party(L,              "ПРОДАВЕЦ / VÂNZĂTOR",    companyName,          companyAddr, companyFiscal, companyIban);
    party(L + partyW + 8, "ПОКУПАТЕЛЬ / CUMPĂRĂTOR", s(doc.CUSTOMER_NAME), s(doc.CUSTOMER_ADDRESS), s(doc.CUSTOMER_TAX), "");

    pdf.text("", L, partyY + pH + 8);

    // ── Items table ──────────────────────────────────────────────────────────
    // Columns — widths must sum to W=525
    // #:18  Name:185  Qty:46  Unit:28  Price:50  БезНДС:58  НДС%:30  НДС:52  Итого:58 → 525
    const col = {
      num:   { x: L,       w: 18  },
      name:  { x: L+18,    w: 185 },
      qty:   { x: L+203,   w: 46  },
      unit:  { x: L+249,   w: 28  },
      price: { x: L+277,   w: 50  },
      sub:   { x: L+327,   w: 58  },
      vatP:  { x: L+385,   w: 30  },
      vatA:  { x: L+415,   w: 52  },
      total: { x: L+467,   w: 58  },
    };
    const RH = 16; // row height

    function cell(y: number, c: { x: number; w: number }, text: string, align: "left"|"right"|"center" = "left", bold = false) {
      pdf.font(bold ? "Bold" : "Regular").fontSize(7).fillColor("#000")
        .text(text, c.x + 2, y + 4, { width: c.w - 4, align, lineBreak: false });
    }

    // Header
    const hY = pdf.y;
    pdf.rect(L, hY, W, RH).fillAndStroke("#eeeeee", "#000000").lineWidth(0.5);
    cell(hY, col.num,   "№",               "center", true);
    cell(hY, col.name,  "Наименование / Denumire", "left", true);
    cell(hY, col.qty,   "Кол.",  "right",  true);
    cell(hY, col.unit,  "UM",    "center", true);
    cell(hY, col.price, "Цена",  "right",  true);
    cell(hY, col.sub,   "Без НДС","right", true);
    cell(hY, col.vatP,  "НДС%",  "right",  true);
    cell(hY, col.vatA,  "НДС",   "right",  true);
    cell(hY, col.total, "Итого", "right",  true);

    let rowY = hY + RH;
    let subtotalSum = 0, vatSum = 0, totalSum = 0;

    for (let i = 0; i < lineRows.length; i++) {
      const ln       = lineRows[i];
      const amount   = n(ln.AMOUNT);
      const subtotal = amount / (1 + VAT_RATE);
      const vatAmt   = amount - subtotal;
      subtotalSum += subtotal;
      vatSum      += vatAmt;
      totalSum    += amount;

      const bg = i % 2 === 1 ? "#fafafa" : "#ffffff";
      pdf.rect(L, rowY, W, RH).fillAndStroke(bg, "#cccccc").lineWidth(0.3);
      cell(rowY, col.num,   String(i + 1));
      cell(rowY, col.name,  s(ln.ITEM_NAME));
      cell(rowY, col.qty,   fmt(n(ln.QTY)),   "right");
      cell(rowY, col.unit,  s(ln.UNIT),        "center");
      cell(rowY, col.price, fmt(n(ln.PRICE)),  "right");
      cell(rowY, col.sub,   fmt(subtotal),     "right");
      cell(rowY, col.vatP,  "20%",             "right");
      cell(rowY, col.vatA,  fmt(vatAmt),       "right");
      cell(rowY, col.total, fmt(amount),       "right");
      rowY += RH;
    }

    // Total row
    pdf.rect(L, rowY, W, RH).fillAndStroke("#f0f0f0", "#000000").lineWidth(0.5);
    pdf.font("Bold").fontSize(7).fillColor("#000")
      .text("ИТОГО / TOTAL", col.num.x + 2, rowY + 4, { width: col.sub.x - col.num.x - 4, lineBreak: false });
    cell(rowY, col.sub,   fmt(subtotalSum), "right", true);
    cell(rowY, col.vatA,  fmt(vatSum),      "right", true);
    cell(rowY, col.total, fmt(totalSum),    "right", true);
    rowY += RH;

    pdf.text("", L, rowY + 6);

    // ── Footer line ───────────────────────────────────────────────────────────
    pdf.fontSize(8).font("Regular").fillColor("#333")
      .text(`Валюта / Moneda: ${curr}`, L);

    // Signatures
    pdf.moveDown(2.5);
    const sigY = pdf.y;
    const sigW = 160;

    pdf.moveTo(L, sigY).lineTo(L + sigW, sigY).lineWidth(0.5).stroke("#000");
    pdf.moveTo(R - sigW, sigY).lineTo(R, sigY).lineWidth(0.5).stroke("#000");

    pdf.fontSize(8).font("Regular").fillColor("#555");
    pdf.text("Руководитель / Director", L, sigY + 3, { width: sigW });
    pdf.text("Бухгалтер / Contabil", R - sigW, sigY + 3, { width: sigW, align: "right" });

    // Stamp
    const stampX = L + W / 2 - 35;
    const stampY = sigY - 8;
    pdf.rect(stampX, stampY, 70, 30).lineWidth(0.5).dash(3, { space: 3 }).stroke("#bbb").undash();
    pdf.fontSize(7).fillColor("#bbb")
      .text("М.П. / L.S.", stampX, stampY + 10, { width: 70, align: "center" });

    // Footer note
    pdf.moveDown(3);
    pdf.fontSize(7).fillColor("#aaa")
      .text("Сформировано автоматически системой CRM Oracle", L, pdf.y, { align: "center", width: W });

    pdf.end();
  });

  const pdfBuf  = Buffer.concat(chunks);
  const filename = `factura-${s(doc.DOC_NUMBER).replace(/\//g, "-")}.pdf`;

  return new NextResponse(pdfBuf, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(pdfBuf.length),
    },
  });
}
