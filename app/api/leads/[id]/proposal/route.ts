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
function fmt(x: number) {
  return x.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ProposalItem {
  name: string;
  qty: number;
  unit: string;
  price: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const leadId = Number(id);
  if (!leadId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const body = await req.json() as {
    items: ProposalItem[];
    validity: string;
    note: string;
    currency: string;
  };

  const leads = await query<Row>(`
    SELECT l.NAME, l.COMPANY, l.PHONE, l.EMAIL,
           l.ASSIGNED_TO, l.CREATED_AT
    FROM AGRO_CRM_LEADS l
    WHERE l.ID = :1
  `, [leadId]);

  if (!leads.length)
    return NextResponse.json({ error: "Лид не найден" }, { status: 404 });

  const lead     = leads[0];
  const items    = body.items ?? [];
  const currency = body.currency || "MDL";
  const total    = items.reduce((sum, it) => sum + n(it.qty) * n(it.price), 0);

  const today = new Date().toLocaleDateString("ru-RU");
  const num   = `КП-${leadId}-${Date.now().toString().slice(-6)}`;

  const fontDir  = path.join(process.cwd(), "public", "fonts");
  const fontReg  = path.join(fontDir, "DejaVuSans.ttf");
  const fontBold = path.join(fontDir, "DejaVuSans-Bold.ttf");

  const pdf    = new PDFDocument({ margin: 50, size: "A4" });
  pdf.registerFont("Regular", fontReg);
  pdf.registerFont("Bold",    fontBold);
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve) => {
    pdf.on("end", resolve);

    // ── Header ──────────────────────────────────────────────────────────
    pdf.fontSize(18).font("Bold")
      .text("КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", { align: "center" });
    pdf.moveDown(0.3);
    pdf.fontSize(10).font("Regular")
      .text(`${num}   от ${today}`, { align: "center" });
    if (body.validity)
      pdf.text(`Действительно до: ${body.validity}`, { align: "center" });

    pdf.moveDown(0.8);
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke();
    pdf.moveDown(0.6);

    // ── Addressee ────────────────────────────────────────────────────────
    pdf.fontSize(10).font("Bold").text("Кому:");
    pdf.font("Regular")
      .text(s(lead.NAME))
      .text(s(lead.COMPANY) ? s(lead.COMPANY) : "")
      .text(s(lead.PHONE)   ? `Тел: ${s(lead.PHONE)}` : "")
      .text(s(lead.EMAIL)   ? `Email: ${s(lead.EMAIL)}` : "");

    pdf.moveDown(0.8);

    // ── Note / intro ─────────────────────────────────────────────────────
    if (body.note?.trim()) {
      pdf.fontSize(10).font("Regular").text(body.note.trim(), { lineGap: 3 });
      pdf.moveDown(0.8);
    }

    // ── Items table ──────────────────────────────────────────────────────
    if (items.length > 0) {
      // Column X positions and widths — independent cells, no "continued" chaining
      const C = { num: 50, name: 72, qty: 312, unit: 352, price: 393, amount: 458 };
      const W = { num: 20,  name: 235, qty: 36,  unit: 36,  price: 60,  amount: 87  };
      const RH = 18; // fixed row height in pts

      function row(y: number, cells: { x: number; w: number; text: string; align?: "left"|"right"|"center" }[]) {
        cells.forEach(({ x, w, text, align }) => {
          pdf.text(text, x, y, { width: w, align: align ?? "left", lineBreak: false });
        });
      }

      // Header
      let rowY = pdf.y;
      pdf.font("Bold").fontSize(9);
      row(rowY, [
        { x: C.num,    w: W.num,    text: "№" },
        { x: C.name,   w: W.name,   text: "Наименование" },
        { x: C.qty,    w: W.qty,    text: "Кол-во",           align: "right" },
        { x: C.unit,   w: W.unit,   text: "Ед." },
        { x: C.price,  w: W.price,  text: "Цена",             align: "right" },
        { x: C.amount, w: W.amount, text: `Сумма (${currency})`, align: "right" },
      ]);
      rowY += RH;
      pdf.moveTo(50, rowY - 3).lineTo(545, rowY - 3).stroke("#999");
      rowY += 4;

      // Data rows
      pdf.font("Regular").fontSize(9);
      items.forEach((it, i) => {
        const amount = n(it.qty) * n(it.price);
        row(rowY, [
          { x: C.num,    w: W.num,    text: String(i + 1) },
          { x: C.name,   w: W.name,   text: it.name || "—" },
          { x: C.qty,    w: W.qty,    text: fmt(n(it.qty)),   align: "right" },
          { x: C.unit,   w: W.unit,   text: it.unit || "шт" },
          { x: C.price,  w: W.price,  text: fmt(n(it.price)), align: "right" },
          { x: C.amount, w: W.amount, text: fmt(amount),       align: "right" },
        ]);
        rowY += RH;
      });

      pdf.moveTo(50, rowY - 2).lineTo(545, rowY - 2).stroke("#999");
      rowY += 8;

      // Move cursor after table
      pdf.text("", 50, rowY);
      pdf.font("Bold").fontSize(11)
        .text(`ИТОГО (${currency}): ${fmt(total)}`, { align: "right" });
    }

    pdf.moveDown(1.5);
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke();
    pdf.moveDown(0.5);
    pdf.fontSize(8).font("Regular").fillColor("#888")
      .text("Сформировано системой CRM Oracle", { align: "center" });

    pdf.end();
  });

  const buf      = Buffer.concat(chunks);
  const filename = `proposal-${leadId}.pdf`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(buf.length),
    },
  });
}
