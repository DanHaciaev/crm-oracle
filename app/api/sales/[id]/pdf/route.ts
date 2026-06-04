import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import PDFDocument from "pdfkit";

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
      SELECT sl.LINE_NUM,
             NVL(i.NAME_RU, i.NAME) ITEM_NAME,
             NVL(sl.QTY,0) QTY, NVL(sl.UNIT,'шт') UNIT,
             NVL(sl.PRICE,0) PRICE,
             NVL(sl.AMOUNT,0) AMOUNT,
             NVL(sl.AMOUNT_MDL,sl.AMOUNT) AMOUNT_MDL,
             NVL(sl.NET_WEIGHT_KG,0) NET_KG
      FROM AGRO_SALES_LINES sl
      JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
      WHERE sl.SALES_DOC_ID = :1
      ORDER BY sl.LINE_NUM
    `, [docId]),
  ]);

  if (!docRows.length)
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });

  const doc  = docRows[0];
  const curr = s(doc.CURRENCY_CODE) || "MDL";

  const pdf = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve) => {
    pdf.on("end", resolve);

    // Header
    pdf.fontSize(18).font("Helvetica-Bold").text("СЧЁТ / INVOICE", { align: "center" });
    pdf.moveDown(0.4);
    pdf.fontSize(11).font("Helvetica")
      .text(`№ ${s(doc.DOC_NUMBER)}   от ${fmtDate(doc.DOC_DATE)}`, { align: "center" });
    if (doc.INVOICE_NUMBER)
      pdf.fontSize(10).text(`Накладная: ${s(doc.INVOICE_NUMBER)}`, { align: "center" });

    pdf.moveDown(1);
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke();
    pdf.moveDown(0.5);

    // Customer
    pdf.fontSize(10).font("Helvetica-Bold").text("Клиент:");
    pdf.font("Helvetica")
      .text(s(doc.CUSTOMER_NAME))
      .text(s(doc.CUSTOMER_TAX) ? `ИНН/Fiscal: ${s(doc.CUSTOMER_TAX)}` : "")
      .text(s(doc.CUSTOMER_ADDRESS) ? `Адрес: ${s(doc.CUSTOMER_ADDRESS)}` : "")
      .text(s(doc.CUSTOMER_PHONE) ? `Тел: ${s(doc.CUSTOMER_PHONE)}` : "")
      .text(s(doc.CUSTOMER_EMAIL) ? `Email: ${s(doc.CUSTOMER_EMAIL)}` : "");

    pdf.moveDown(1);

    if (lineRows.length > 0) {
      // Table header
      const cols = { num: 50, name: 70, qty: 340, unit: 375, price: 410, amount: 475 };
      pdf.font("Helvetica-Bold").fontSize(9);
      pdf.text("№",              cols.num,  pdf.y, { width: 18,  continued: true })
        .text("Наименование",   cols.name, pdf.y, { width: 265, continued: true })
        .text("Кол-во",         cols.qty,  pdf.y, { width: 30,  continued: true, align: "right" })
        .text("Ед.",            cols.unit, pdf.y, { width: 30,  continued: true })
        .text("Цена",           cols.price, pdf.y, { width: 60,  continued: true, align: "right" })
        .text(`Сумма (${curr})`, cols.amount, pdf.y, { width: 70, align: "right" });

      pdf.moveDown(0.3);
      pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke("#999");
      pdf.moveDown(0.3);

      // Rows
      pdf.font("Helvetica").fontSize(9);
      for (const ln of lineRows) {
        const y = pdf.y;
        pdf.text(s(ln.LINE_NUM),   cols.num,   y, { width: 18,  continued: true })
          .text(s(ln.ITEM_NAME),  cols.name,  y, { width: 265, continued: true })
          .text(fmt(n(ln.QTY)),   cols.qty,   y, { width: 30,  continued: true, align: "right" })
          .text(s(ln.UNIT),       cols.unit,  y, { width: 30,  continued: true })
          .text(fmt(n(ln.PRICE)), cols.price, y, { width: 60,  continued: true, align: "right" })
          .text(fmt(n(ln.AMOUNT)), cols.amount, y, { width: 70, align: "right" });
      }

      pdf.moveDown(0.3);
      pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).stroke("#999");
      pdf.moveDown(0.5);
    }

    // Totals
    pdf.font("Helvetica-Bold").fontSize(10);
    pdf.text(`Итого (${curr}): ${fmt(n(doc.TOTAL_AMOUNT))}`, { align: "right" });
    if (curr !== "MDL")
      pdf.font("Helvetica").fontSize(9)
        .text(`≈ ${fmt(n(doc.TOTAL_AMOUNT_MDL))} MDL`, { align: "right" });
    pdf.font("Helvetica").fontSize(9)
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
