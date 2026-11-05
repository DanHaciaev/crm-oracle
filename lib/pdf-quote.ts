import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { query } from "@/lib/oracle";
import { getCompany, type Lang } from "@/lib/documents/common";
import type { QuoteDetail } from "@/lib/quotes";

// Commercial offer as a real PDF file (download / attach to an e-mail).
// Same content as the HTML print form (/documents/print/quote).

const T = {
  ro: {
    title: "OFERTĂ COMERCIALĂ", nr: "Nr.", date: "Data", valid: "Valabilă până la", to: "Către", contact: "Persoana de contact",
    supplier: "Furnizor", idno: "IDNO", phone: "Tel.", email: "E-mail", col_no: "#", col_item: "Denumirea", col_pack: "Ambalaj",
    col_qty: "Cantitate, kg", col_price: "Preț / kg", col_sum: "Suma", subtotal: "Subtotal", discount: "Reducere", total: "Total",
    delivery: "Condiții de livrare", payment: "Condiții de plată", notes: "Observații", manager: "Manager", sign: "Semnătura",
  },
  ru: {
    title: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", nr: "№", date: "Дата", valid: "Действительно до", to: "Кому", contact: "Контактное лицо",
    supplier: "Поставщик", idno: "IDNO", phone: "Тел.", email: "E-mail", col_no: "№", col_item: "Наименование", col_pack: "Упаковка",
    col_qty: "Кол-во, кг", col_price: "Цена / кг", col_sum: "Сумма", subtotal: "Сумма без скидки", discount: "Скидка", total: "Итого",
    delivery: "Условия поставки", payment: "Условия оплаты", notes: "Примечания", manager: "Менеджер", sign: "Подпись",
  },
  en: {
    title: "COMMERCIAL OFFER", nr: "No.", date: "Date", valid: "Valid until", to: "To", contact: "Contact person",
    supplier: "Supplier", idno: "Tax ID", phone: "Phone", email: "E-mail", col_no: "#", col_item: "Item", col_pack: "Packaging",
    col_qty: "Qty, kg", col_price: "Price / kg", col_sum: "Amount", subtotal: "Subtotal", discount: "Discount", total: "Total",
    delivery: "Delivery terms", payment: "Payment terms", notes: "Notes", manager: "Manager", sign: "Signature",
  },
} satisfies Record<Lang, unknown>;

const PAGE_W = 595.28, PAGE_H = 841.89, M = 45, W = PAGE_W - 2 * M;
const money = (v: number, d = 2) => v.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
// Per-kg prices keep up to 4 decimals (0,4550 EUR) but don't pad 12,50 → 12,5000.
const price = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const day = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
};

function fonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const regular = path.join(dir, "DejaVuSans.ttf"), bold = path.join(dir, "DejaVuSans-Bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) throw new Error("Нет шрифтов public/fonts/DejaVuSans*.ttf");
  return { regular, bold };
}

// Company logo from Settings — PDFKit embeds only PNG / JPEG.
async function logo(): Promise<Buffer | null> {
  try {
    const rows = await query<{ MIME_TYPE: string; DATA: Buffer }>(`SELECT MIME_TYPE, DATA FROM AGRO_CRM_COMPANY_LOGO WHERE ID = 1`, []);
    const r = rows[0];
    return r && /png|jpe?g/i.test(String(r.MIME_TYPE)) && Buffer.isBuffer(r.DATA) ? r.DATA : null;
  } catch { return null; }
}

export async function generateQuotePdf(q: QuoteDetail, lang: Lang): Promise<Buffer> {
  const L = T[lang];
  const f = fonts();
  const [company, img] = await Promise.all([getCompany(), logo()]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: `${L.title} ${q.number}` } });
    doc.registerFont("R", f.regular);
    doc.registerFont("B", f.bold);
    const chunks: Buffer[] = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header: logo + company block on the left, title on the right.
    let y = M;
    if (img) { try { doc.image(img, M, y, { fit: [110, 50] }); } catch { /* broken image — skip */ } }
    const cx = img ? M + 120 : M;
    doc.font("B").fontSize(11).fillColor("#000").text(company.name, cx, y, { width: 230 });
    doc.font("R").fontSize(8).fillColor("#444");
    const companyLines = [company.address, company.fiscal_code && `${L.idno}: ${company.fiscal_code}`,
      company.phone && `${L.phone}: ${company.phone}`, company.email && `${L.email}: ${company.email}`].filter(Boolean) as string[];
    for (const line of companyLines) doc.text(line, cx, doc.y, { width: 230 });
    doc.font("B").fontSize(15).fillColor("#000").text(L.title, M + W - 230, y, { width: 230, align: "right" });
    doc.font("R").fontSize(9).fillColor("#333")
       .text(`${L.nr} ${q.number}`, M + W - 230, doc.y + 2, { width: 230, align: "right" })
       .text(`${L.date}: ${day(q.date)}`, { width: 230, align: "right" });
    if (q.valid_until) doc.text(`${L.valid}: ${day(q.valid_until)}`, { width: 230, align: "right" });
    y = Math.max(doc.y, M + 60) + 14;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#c8d3e8").lineWidth(1).stroke();
    y += 10;

    // Addressee.
    doc.font("R").fontSize(8).fillColor("#666").text(L.to.toUpperCase(), M, y);
    doc.font("B").fontSize(11).fillColor("#000").text(q.client_name, M, doc.y + 1, { width: W });
    doc.font("R").fontSize(9).fillColor("#333");
    const to = [q.customer_address, q.customer_tax_id && `${L.idno}: ${q.customer_tax_id}`,
      q.contact_person && `${L.contact}: ${q.contact_person}`,
      [q.phone && `${L.phone}: ${q.phone}`, q.email && `${L.email}: ${q.email}`].filter(Boolean).join("   ")].filter(Boolean) as string[];
    for (const line of to) doc.text(line, M, doc.y, { width: W });
    y = doc.y + 12;

    // Lines table.
    const cols = [
      { key: "no", w: 22, align: "left" as const }, { key: "item", w: 190, align: "left" as const },
      { key: "pack", w: 90, align: "left" as const }, { key: "qty", w: 70, align: "right" as const },
      { key: "price", w: 60, align: "right" as const }, { key: "sum", w: W - 432, align: "right" as const },
    ];
    const header = [L.col_no, L.col_item, L.col_pack, L.col_qty, `${L.col_price}`, `${L.col_sum}, ${q.currency}`];
    const drawRow = (cells: string[], bold: boolean, fill?: string) => {
      doc.font(bold ? "B" : "R").fontSize(8.5);
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: cols[i].w - 6 }))) + 8;
      if (y + h > PAGE_H - M - 40) { doc.addPage(); y = M; }
      if (fill) doc.rect(M, y, W, h).fillColor(fill).fill();
      let x = M;
      cells.forEach((c, i) => {
        doc.fillColor("#000").text(c, x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].align });
        x += cols[i].w;
      });
      y += h;
      doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#dde3ef").lineWidth(0.5).stroke();
    };
    drawRow(header, true, "#eef2f9");
    q.lines.forEach((l, i) => drawRow([
      String(i + 1), l.description + (l.item_code ? `\n${l.item_code}` : ""), l.packaging || "—",
      money(l.qty_kg, l.qty_kg % 1 ? 1 : 0), price(l.price_per_kg), money(l.amount),
    ], false));

    // Totals.
    y += 6;
    const tot = (label: string, value: string, bold = false) => {
      doc.font(bold ? "B" : "R").fontSize(bold ? 11 : 9).fillColor("#000");
      doc.text(label, M + W - 260, y, { width: 150, align: "right" });
      doc.text(value, M + W - 105, y, { width: 105, align: "right" });
      y = doc.y + 3;
    };
    if (q.discount_pct > 0) {
      tot(L.subtotal, `${money(q.subtotal)} ${q.currency}`);
      tot(`${L.discount} ${money(q.discount_pct, q.discount_pct % 1 ? 2 : 0)}%`, `−${money(q.discount_amount)} ${q.currency}`);
    }
    tot(L.total, `${money(q.total)} ${q.currency}`, true);
    y += 10;

    // Terms.
    const block = (label: string, value: string) => {
      if (!value) return;
      if (y > PAGE_H - M - 80) { doc.addPage(); y = M; }
      doc.font("B").fontSize(9).fillColor("#000").text(`${label}:`, M, y, { continued: true }).font("R").text(` ${value}`, { width: W });
      y = doc.y + 6;
    };
    block(L.delivery, q.delivery_terms);
    block(L.payment, q.payment_terms);
    block(L.notes, q.notes);

    // Manager + signature.
    if (y > PAGE_H - M - 60) { doc.addPage(); y = M; }
    y = Math.max(y + 20, doc.y + 20);
    doc.font("R").fontSize(9).fillColor("#333").text(`${L.manager}: ${q.manager_name || "—"}`, M, y);
    doc.moveTo(M + W - 180, y + 12).lineTo(M + W, y + 12).strokeColor("#999").lineWidth(0.7).stroke();
    doc.fontSize(8).fillColor("#666").text(L.sign, M + W - 180, y + 15, { width: 180, align: "center" });

    doc.end();
  });
}
