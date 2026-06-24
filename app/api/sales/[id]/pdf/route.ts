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
function fmt(n: number) { return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU");
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

  const [docRows, lineRows] = await Promise.all([
    query<Row>(`
      SELECT sd.ID, sd.DOC_NUMBER, sd.DOC_DATE, sd.STATUS,
             sd.SALE_TYPE, sd.INVOICE_NUMBER,
             NVL(sd.TOTAL_AMOUNT,0) TOTAL_AMOUNT,
             NVL(sd.TOTAL_AMOUNT_MDL,0) TOTAL_AMOUNT_MDL,
             NVL(sd.CURRENCY_CODE,'MDL') CURRENCY_CODE,
             NVL(sd.TOTAL_NET_KG,0) TOTAL_NET_KG,
             c.NAME CUSTOMER_NAME,
             c.TAX_ID CUSTOMER_TAX,
             c.ADDRESS CUSTOMER_ADDRESS,
             c.CONTACT_EMAIL CUSTOMER_EMAIL,
             c.CONTACT_PHONE CUSTOMER_PHONE
      FROM AGRO_SALES_DOCS sd
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      WHERE sd.ID = :1
    `, [docId]),
    query<Row>(`
      SELECT sl.ID                          AS LINE_NUM,
             NVL(i.NAME_RU, i.NAME_RO)     AS ITEM_NAME,
             NVL(i.UNIT, 'кг')             AS UNIT,
             NVL(sl.NET_WEIGHT_KG, 0)      AS NET_KG,
             NVL(sl.GROSS_WEIGHT_KG, 0)    AS GROSS_KG,
             NVL(sl.PALLETS, 0)            AS PALLETS,
             NVL(sl.CRATES_COUNT, 0)       AS CRATES_COUNT,
             NVL(sl.PRICE_PER_KG, 0)       AS PRICE,
             NVL(sl.AMOUNT, 0)             AS AMOUNT,
             NVL(sl.AMOUNT_MDL, sl.AMOUNT) AS AMOUNT_MDL
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

  const fontDir  = path.join(process.cwd(), "public", "fonts");
  const pdf = new PDFDocument({ margin: 50, size: "A4" });
  pdf.registerFont("Regular", path.join(fontDir, "DejaVuSans.ttf"));
  pdf.registerFont("Bold",    path.join(fontDir, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve) => {
    pdf.on("end", resolve);

    // Header
    pdf.fontSize(18).font("Bold").text("СЧЁТ / INVOICE", { align: "center" });
    pdf.moveDown(0.4);
    pdf.fontSize(11).font("Regular")
      .text(`№ ${s(doc.DOC_NUMBER)}   от ${fmtDate(doc.DOC_DATE)}`, { align: "center" });
    if (doc.INVOICE_NUMBER)
      pdf.fontSize(10).text(`Накладная: ${s(doc.INVOICE_NUMBER)}`, { align: "center" });

    pdf.moveDown(1);
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke();
    pdf.moveDown(0.5);

    // Customer
    pdf.fontSize(10).font("Bold").text("Клиент:");
    pdf.font("Regular")
      .text(s(doc.CUSTOMER_NAME))
      .text(s(doc.CUSTOMER_TAX) ? `ИНН/Fiscal: ${s(doc.CUSTOMER_TAX)}` : "")
      .text(s(doc.CUSTOMER_ADDRESS) ? `Адрес: ${s(doc.CUSTOMER_ADDRESS)}` : "")
      .text(s(doc.CUSTOMER_PHONE) ? `Тел: ${s(doc.CUSTOMER_PHONE)}` : "")
      .text(s(doc.CUSTOMER_EMAIL) ? `Email: ${s(doc.CUSTOMER_EMAIL)}` : "");

    pdf.moveDown(1);

    if (lineRows.length > 0) {
      // №, Наименование, Нетто кг, Брутто кг, Паллет, Цена/кг, Сумма
      const C  = { num: 50, name: 70, netto: 240, brutto: 292, pallets: 348, price: 382, amount: 452 };
      const W  = { num: 18, name: 165, netto: 48,  brutto: 52,  pallets: 30,  price: 65,  amount: 93  };
      const RH = 18;

      function row(y: number, cells: { x: number; w: number; text: string; align?: "left"|"right" }[]) {
        cells.forEach(({ x, w, text, align }) => {
          pdf.text(text, x, y, { width: w, align: align ?? "left", lineBreak: false });
        });
      }

      // Header
      let rowY = pdf.y;
      pdf.font("Bold").fontSize(8);
      row(rowY, [
        { x: C.num,     w: W.num,     text: "№" },
        { x: C.name,    w: W.name,    text: "Наименование" },
        { x: C.netto,   w: W.netto,   text: "Нетто кг",        align: "right" },
        { x: C.brutto,  w: W.brutto,  text: "Брутто кг",       align: "right" },
        { x: C.pallets, w: W.pallets, text: "Пал.",             align: "right" },
        { x: C.price,   w: W.price,   text: "Цена/кг",         align: "right" },
        { x: C.amount,  w: W.amount,  text: `Сумма (${curr})`, align: "right" },
      ]);
      rowY += RH;
      pdf.moveTo(50, rowY - 3).lineTo(545, rowY - 3).stroke("#999");
      rowY += 4;

      // Data rows
      pdf.font("Regular").fontSize(8);
      let i = 1;
      for (const ln of lineRows) {
        row(rowY, [
          { x: C.num,     w: W.num,     text: String(i++) },
          { x: C.name,    w: W.name,    text: s(ln.ITEM_NAME) },
          { x: C.netto,   w: W.netto,   text: fmt(n(ln.NET_KG)),    align: "right" },
          { x: C.brutto,  w: W.brutto,  text: fmt(n(ln.GROSS_KG)),  align: "right" },
          { x: C.pallets, w: W.pallets, text: String(n(ln.PALLETS)), align: "right" },
          { x: C.price,   w: W.price,   text: fmt(n(ln.PRICE)),      align: "right" },
          { x: C.amount,  w: W.amount,  text: fmt(n(ln.AMOUNT)),     align: "right" },
        ]);
        rowY += RH;
      }

      pdf.moveTo(50, rowY - 2).lineTo(545, rowY - 2).stroke("#999");
      rowY += 8;
      pdf.text("", 50, rowY);
    }

    // Totals
    pdf.font("Bold").fontSize(10);
    pdf.text(`Итого (${curr}): ${fmt(n(doc.TOTAL_AMOUNT))}`, { align: "right" });
    if (curr !== "MDL")
      pdf.font("Regular").fontSize(9)
        .text(`≈ ${fmt(n(doc.TOTAL_AMOUNT_MDL))} MDL`, { align: "right" });
    pdf.font("Regular").fontSize(9)
      .text(`Нетто кг: ${fmt(n(doc.TOTAL_NET_KG))}`, { align: "right" });

    pdf.moveDown(1.5);
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke();
    pdf.moveDown(0.5);
    pdf.fontSize(8).fillColor("#888")
      .text("Сформировано автоматически системой CRM Oracle", { align: "center" });

    pdf.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename  = `invoice-${s(doc.DOC_NUMBER).replace(/\//g, "-")}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.length),
    },
  });
}
