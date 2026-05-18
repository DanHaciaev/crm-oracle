import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

export type PdfLang = "ru" | "ro" | "en";

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

const T = {
  ru: {
    title:         "ВЕСОВОЙ АКТ",
    numLabel:      "Номер:",
    dateLabel:     "Дата:",
    clientLabel:   "Клиент:",
    whLabel:       "Склад:",
    docLabel:      "Dok. продажи:",
    statusLabel:   "Статус:",
    productLabel:  "Продукция:",
    timeLabel:     "Время взвеш.:",
    cratesLabel:   "Кол-во ящиков:",
    colBarcode:    "Штрихкод",
    colProduct:    "Продукция",
    colBatch:      "Партия",
    colGross:      "Брутто, кг",
    colTare:       "Тара, кг",
    colNet:        "Нетто, кг",
    total:         "Итого:",
    cardGross:     "Брутто",
    cardTare:      "Тара",
    cardNet:       "Нетто",
    signWeigher:   "Весовщик",
    signRecipient: "Получатель",
    itemName: (l: Line) => l.item_name ?? "—",
  },
  ro: {
    title:         "TICHET DE CANTARIRE",
    numLabel:      "Nr.:",
    dateLabel:     "Data:",
    clientLabel:   "Client:",
    whLabel:       "Depozit:",
    docLabel:      "Doc. vânzare:",
    statusLabel:   "Status:",
    productLabel:  "Produs:",
    timeLabel:     "Ora cântăririi:",
    cratesLabel:   "Nr. lăzi:",
    colBarcode:    "Cod",
    colProduct:    "Produs",
    colBatch:      "Lot",
    colGross:      "Brut, kg",
    colTare:       "Tara, kg",
    colNet:        "Net, kg",
    total:         "Total:",
    cardGross:     "Brut",
    cardTare:      "Tara",
    cardNet:       "Net",
    signWeigher:   "Cantaragiu",
    signRecipient: "Primitor",
    itemName: (l: Line) => l.item_name_ro ?? l.item_name ?? "—",
  },
  en: {
    title:         "WEIGHT TICKET",
    numLabel:      "Number:",
    dateLabel:     "Date:",
    clientLabel:   "Client:",
    whLabel:       "Warehouse:",
    docLabel:      "Sales doc.:",
    statusLabel:   "Status:",
    productLabel:  "Product:",
    timeLabel:     "Weighed at:",
    cratesLabel:   "Crates count:",
    colBarcode:    "Barcode",
    colProduct:    "Product",
    colBatch:      "Batch",
    colGross:      "Gross, kg",
    colTare:       "Tare, kg",
    colNet:        "Net, kg",
    total:         "Total:",
    cardGross:     "Gross",
    cardTare:      "Tare",
    cardNet:       "Net",
    signWeigher:   "Weigher",
    signRecipient: "Recipient",
    itemName: (l: Line) => l.item_name ?? "—",
  },
} satisfies Record<PdfLang, unknown>;

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
    "Не найден шрифт с поддержкой кириллицы. Положи DejaVuSans.ttf и DejaVuSans-Bold.ttf в public/fonts/"
  );
}

export async function generateActPdf(data: ActData, lang: PdfLang = "ru"): Promise<Buffer> {
  const fonts = findCyrillicFont();
  const t = T[lang];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      layout: "portrait",
    });

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
    const firstItem   = t.itemName(data.lines[0] ?? { item_name: null, item_name_ro: null } as unknown as Line);

    // --- Header ---------------------------------------------------------
    doc.font("Body").fontSize(8).fillColor("#888888")
       .text("AGRO Company SRL", MARGIN, MARGIN, { width: CONTENT_WIDTH, align: "center" });

    doc.font("BodyBold").fontSize(16).fillColor("#000000")
       .text(t.title, MARGIN, MARGIN + 14, { width: CONTENT_WIDTH, align: "center" });

    // --- Info fields ----------------------------------------------------
    const infoY = MARGIN + 50;
    const col1X = MARGIN;
    const col2X = MARGIN + CONTENT_WIDTH / 2;
    const lineH = 16;

    let y = infoY;
    doc.fontSize(10);

    drawInfoPair(doc, col1X, y, t.numLabel,    data.ticket_number);
    drawInfoPair(doc, col2X, y, t.dateLabel,   fmtDateRu(data.ticket_date));
    y += lineH;

    drawInfoPair(doc, col1X, y, t.clientLabel, data.customer_name ?? "—");
    drawInfoPair(doc, col2X, y, t.whLabel,     data.warehouse_name ?? "—");
    y += lineH;

    drawInfoPair(doc, col1X, y, t.docLabel,    data.sales_doc_number ?? "—");
    drawInfoPair(doc, col2X, y, t.statusLabel, data.status);
    y += lineH;

    drawInfoPair(doc, col1X, y, t.productLabel, firstItem);
    drawInfoPair(doc, col2X, y, t.timeLabel,    fmtDateTimeRu(data.created_at));
    y += lineH;

    drawInfoPair(doc, col1X, y, t.cratesLabel, String(cratesCount));

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
      doc.text("№",             cx, yy + 6, { width: colWidths[0], align: "center" }); cx += colWidths[0];
      doc.text(t.colBarcode,    cx, yy + 6, { width: colWidths[1] });                  cx += colWidths[1];
      doc.text(t.colProduct,    cx, yy + 6, { width: colWidths[2] });                  cx += colWidths[2];
      doc.text(t.colBatch,      cx, yy + 6, { width: colWidths[3] });                  cx += colWidths[3];
      doc.text(t.colGross,      cx, yy + 6, { width: colWidths[4], align: "right" });  cx += colWidths[4];
      doc.text(t.colTare,       cx, yy + 6, { width: colWidths[5], align: "right" });  cx += colWidths[5];
      doc.text(t.colNet,        cx, yy + 6, { width: colWidths[6], align: "right" });
    };

    drawHeader(y);
    y += 20;

    doc.font("Body").fontSize(8).fillColor("#000000");
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      let cx = MARGIN + 2;
      doc.text(String(l.line_no ?? i + 1), cx, y + 2, { width: colWidths[0], align: "center" }); cx += colWidths[0];
      doc.text(l.crate_code   ?? "—",      cx, y + 2, { width: colWidths[1] });                  cx += colWidths[1];
      doc.text(t.itemName(l),              cx, y + 2, { width: colWidths[2] });                  cx += colWidths[2];
      doc.text(l.batch_number ?? "—",      cx, y + 2, { width: colWidths[3] });                  cx += colWidths[3];
      doc.text(fmt(l.gross_kg),            cx, y + 2, { width: colWidths[4], align: "right" });  cx += colWidths[4];
      doc.text(fmt(l.tare_kg),             cx, y + 2, { width: colWidths[5], align: "right" });  cx += colWidths[5];
      doc.text(fmt(l.net_kg),              cx, y + 2, { width: colWidths[6], align: "right" });
      y += 14;
    }

    // Totals
    doc.font("BodyBold");
    let cx = MARGIN + 2;
    doc.text(t.total, cx, y + 2, {
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

    drawCard(MARGIN,                   t.cardGross, fmt(totalGross));
    drawCard(MARGIN + cardW + 8,       t.cardTare,  fmt(totalTare));
    drawCard(MARGIN + 2 * (cardW + 8), t.cardNet,   fmt(totalNet));

    // --- Signatures -----------------------------------------------------
    y += cardH + 30;
    const signW = (CONTENT_WIDTH - 24) / 2;

    doc.moveTo(MARGIN, y).lineTo(MARGIN + signW, y).stroke("#aaaaaa");
    doc.font("Body").fontSize(8).fillColor("#888888")
       .text(t.signWeigher, MARGIN, y + 4, { width: signW, align: "center" });

    doc.moveTo(MARGIN + signW + 24, y).lineTo(MARGIN + signW + 24 + signW, y).stroke("#aaaaaa");
    doc.text(t.signRecipient, MARGIN + signW + 24, y + 4, { width: signW, align: "center" });

    doc.end();
  });
}

function drawInfoPair(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
  doc.font("Body").fillColor("#555555").text(label, x, y);
  const labelW = doc.widthOfString(label);
  doc.font("BodyBold").fillColor("#000000").text(" " + value, x + labelW, y);
}
