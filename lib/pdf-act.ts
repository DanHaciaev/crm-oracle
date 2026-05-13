import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

interface Line {
  id: number;
  line_no: number | null;
  crate_code: string | null;
  batch_number: string | null;
  item_name: string | null;
  item_name_ro: string | null;
  gross_kg: number;
  tare_kg: number;
  net_kg: number;
}

interface ActData {
  id: number;
  ticket_number: string;
  ticket_date: string | null;
  status: string;
  operator: string | null;
  customer_name: string | null;
  warehouse_name: string | null;
  sales_doc_number: string | null;
  created_at: string | null;
  lines: Line[];
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateRu(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTimeRu(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PAGE_WIDTH = 595.28; // A4
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Ищет TTF с кириллицей. Приоритет:
 *   1) Локальный override:   public/fonts/DejaVuSans.ttf|DejaVuSans-Bold.ttf
 *   2) Windows:              C:\Windows\Fonts\arial.ttf | arialbd.ttf
 *   3) Linux (Debian/Ubuntu) /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
 *   4) macOS:                /Library/Fonts/Arial.ttf | Arial Bold.ttf
 */
function findCyrillicFont(): { regular: string; bold: string } {
  const candidates = [
    {
      regular: path.join(process.cwd(), "public", "fonts", "DejaVuSans.ttf"),
      bold:    path.join(process.cwd(), "public", "fonts", "DejaVuSans-Bold.ttf"),
    },
    {
      regular: "C:\\Windows\\Fonts\\arial.ttf",
      bold:    "C:\\Windows\\Fonts\\arialbd.ttf",
    },
    {
      regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      bold:    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    },
    {
      regular: "/usr/share/fonts/dejavu/DejaVuSans.ttf",
      bold:    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    },
    {
      regular: "/Library/Fonts/Arial.ttf",
      bold:    "/Library/Fonts/Arial Bold.ttf",
    },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.regular) && fs.existsSync(c.bold)) return c;
  }
  throw new Error(
    "Не найден шрифт с поддержкой кириллицы. Положи DejaVuSans.ttf и DejaVuSans-Bold.ttf в public/fonts/ " +
    "(скачать: https://dejavu-fonts.github.io/Download.html) — или установи fonts-dejavu в системе."
  );
}

export async function generateActPdf(data: ActData): Promise<Buffer> {
  const fonts = findCyrillicFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      layout: "portrait",
    });

    // Регистрируем шрифты с поддержкой кириллицы. Все text() ниже используют
    // эти имена вместо встроенных Helvetica/Helvetica-Bold.
    doc.registerFont("Body",     fonts.regular);
    doc.registerFont("BodyBold", fonts.bold);

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalGross  = data.lines.reduce((s, l) => s + l.gross_kg, 0);
    const totalTare   = data.lines.reduce((s, l) => s + l.tare_kg,  0);
    const totalNet    = data.lines.reduce((s, l) => s + l.net_kg,   0);
    const cratesCount = data.lines.length;
    const firstItem   = data.lines[0]?.item_name ?? "—";

    // --- Header ---------------------------------------------------------
    doc.font("Body").fontSize(8).fillColor("#888888")
       .text("AGRO Company SRL", MARGIN, MARGIN, { width: CONTENT_WIDTH, align: "center" });

    doc.font("BodyBold").fontSize(16).fillColor("#000000")
       .text("ВЕСОВОЙ АКТ / TICHET DE CANTARIRE", MARGIN, MARGIN + 14, { width: CONTENT_WIDTH, align: "center" });

    // --- Info fields ----------------------------------------------------
    const infoY = MARGIN + 50;
    const col1X = MARGIN;
    const col2X = MARGIN + CONTENT_WIDTH / 2;
    const lineH = 16;

    let y = infoY;
    doc.fontSize(10);

    drawInfoPair(doc, col1X, y, "Номер / Nr.:",        data.ticket_number);
    drawInfoPair(doc, col2X, y, "Дата / Data:",        fmtDateRu(data.ticket_date));
    y += lineH;

    drawInfoPair(doc, col1X, y, "Клиент / Client:",    data.customer_name ?? "—");
    drawInfoPair(doc, col2X, y, "Склад / Depozit:",    data.warehouse_name ?? "—");
    y += lineH;

    drawInfoPair(doc, col1X, y, "Док. продажи / Doc. vânzare:", data.sales_doc_number ?? "—");
    drawInfoPair(doc, col2X, y, "Статус / Status:",    data.status);
    y += lineH;

    drawInfoPair(doc, col1X, y, "Продукция / Produs:", firstItem);
    drawInfoPair(doc, col2X, y, "Время взвеш. / Ora cantaririi:", fmtDateTimeRu(data.created_at));
    y += lineH;

    drawInfoPair(doc, col1X, y, "Кол-во ящиков / Nr. lazi:", String(cratesCount));

    // --- Table ----------------------------------------------------------
    y += lineH + 12;

    const colWidths = [20, 100, 0, 0, 60, 60, 60];
    const flexibleWidth = CONTENT_WIDTH - 20 - 100 - 60 - 60 - 60;
    colWidths[2] = Math.round(flexibleWidth * 0.55);
    colWidths[3] = flexibleWidth - colWidths[2];

    const drawHeader = (yy: number) => {
      doc.rect(MARGIN, yy, CONTENT_WIDTH, 20).fill("#f5f5f5");
      doc.fillColor("#000000").font("BodyBold").fontSize(8);
      let cx = MARGIN + 2;
      doc.text("№",                  cx, yy + 6, { width: colWidths[0], align: "center" }); cx += colWidths[0];
      doc.text("Штрихкод / Cod",     cx, yy + 6, { width: colWidths[1] });                  cx += colWidths[1];
      doc.text("Продукция / Produs", cx, yy + 6, { width: colWidths[2] });                  cx += colWidths[2];
      doc.text("Партия / Lot",       cx, yy + 6, { width: colWidths[3] });                  cx += colWidths[3];
      doc.text("Брутто, кг",         cx, yy + 6, { width: colWidths[4], align: "right" });  cx += colWidths[4];
      doc.text("Тара, кг",           cx, yy + 6, { width: colWidths[5], align: "right" });  cx += colWidths[5];
      doc.text("Нетто, кг",          cx, yy + 6, { width: colWidths[6], align: "right" });
    };

    drawHeader(y);
    y += 20;

    doc.font("Body").fontSize(8).fillColor("#000000");
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      let cx = MARGIN + 2;
      doc.text(String(l.line_no ?? i + 1), cx, y + 2, { width: colWidths[0], align: "center" }); cx += colWidths[0];
      doc.text(l.crate_code   ?? "—",      cx, y + 2, { width: colWidths[1] });                  cx += colWidths[1];
      doc.text(l.item_name    ?? "—",      cx, y + 2, { width: colWidths[2] });                  cx += colWidths[2];
      doc.text(l.batch_number ?? "—",      cx, y + 2, { width: colWidths[3] });                  cx += colWidths[3];
      doc.text(fmt(l.gross_kg),            cx, y + 2, { width: colWidths[4], align: "right" });  cx += colWidths[4];
      doc.text(fmt(l.tare_kg),             cx, y + 2, { width: colWidths[5], align: "right" });  cx += colWidths[5];
      doc.text(fmt(l.net_kg),              cx, y + 2, { width: colWidths[6], align: "right" });
      y += 14;
    }

    // Totals
    doc.font("BodyBold");
    let cx = MARGIN + 2;
    doc.text("Итого / Total:", cx, y + 2, {
      width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
      align: "right",
    });
    cx += colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
    doc.text(fmt(totalGross), cx, y + 2, { width: colWidths[4], align: "right" }); cx += colWidths[4];
    doc.text(fmt(totalTare),  cx, y + 2, { width: colWidths[5], align: "right" }); cx += colWidths[5];
    doc.text(fmt(totalNet),   cx, y + 2, { width: colWidths[6], align: "right" });

    // --- Summary cards --------------------------------------------------
    y += 32;
    const cardW = (CONTENT_WIDTH - 16) / 3;
    const cardH = 50;

    const drawCard = (x: number, label: string, value: string) => {
      doc.roundedRect(x, y, cardW, cardH, 4).stroke("#cccccc");
      doc.font("Body").fontSize(8).fillColor("#888888")
         .text(label, x, y + 6, { width: cardW, align: "center" });
      doc.font("BodyBold").fontSize(16).fillColor("#000000")
         .text(value, x, y + 18, { width: cardW, align: "center" });
      doc.font("Body").fontSize(8).fillColor("#555555")
         .text("кг", x, y + cardH - 14, { width: cardW, align: "center" });
    };

    drawCard(MARGIN,                       "Брутто / Brut", fmt(totalGross));
    drawCard(MARGIN + cardW + 8,           "Тара / Tara",   fmt(totalTare));
    drawCard(MARGIN + 2 * (cardW + 8),     "Нетто / Net",   fmt(totalNet));

    // --- Signatures -----------------------------------------------------
    y += cardH + 30;
    const signW = (CONTENT_WIDTH - 24) / 2;

    doc.moveTo(MARGIN, y).lineTo(MARGIN + signW, y).stroke("#aaaaaa");
    doc.font("Body").fontSize(8).fillColor("#888888")
       .text("Весовщик / Cantaragiu", MARGIN, y + 4, { width: signW, align: "center" });

    doc.moveTo(MARGIN + signW + 24, y).lineTo(MARGIN + signW + 24 + signW, y).stroke("#aaaaaa");
    doc.text("Получатель / Primitor", MARGIN + signW + 24, y + 4, { width: signW, align: "center" });

    doc.end();
  });
}

function drawInfoPair(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
  doc.font("Body").fillColor("#555555").text(label, x, y);
  const labelW = doc.widthOfString(label);
  doc.font("BodyBold").fillColor("#000000").text(" " + value, x + labelW, y);
}
