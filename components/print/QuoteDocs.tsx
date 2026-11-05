"use client";

import type { quoteDoc } from "@/lib/documents/quote";
import { Lang, f2, dash, Header } from "./PrintShell";

// ── Ofertă comercială (commercial offer) ─────────────────────────────────
type Q = Awaited<ReturnType<typeof quoteDoc>>;

const QT_T = {
  ro: { title: "OFERTĂ COMERCIALĂ", nr: "Nr.", data: "Data", valid: "Valabilă până la", furnizor: "Furnizor", catre: "Către",
        contact: "Persoana de contact", tel: "Tel.", col_den: "Denumirea", col_amb: "Ambalaj", col_cant: "Cantitate, kg",
        col_pret: "Preț / kg", col_suma: "Suma", subtotal: "Subtotal", reducere: "Reducere", total: "Total",
        livrare: "Condiții de livrare", plata: "Condiții de plată", note: "Observații", manager: "Manager", semn: "Semnătura" },
  ru: { title: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", nr: "№", data: "Дата", valid: "Действительно до", furnizor: "Поставщик", catre: "Кому",
        contact: "Контактное лицо", tel: "Тел.", col_den: "Наименование", col_amb: "Упаковка", col_cant: "Кол-во, кг",
        col_pret: "Цена / кг", col_suma: "Сумма", subtotal: "Сумма без скидки", reducere: "Скидка", total: "Итого",
        livrare: "Условия поставки", plata: "Условия оплаты", note: "Примечания", manager: "Менеджер", semn: "Подпись" },
  en: { title: "COMMERCIAL OFFER", nr: "No.", data: "Date", valid: "Valid until", furnizor: "Supplier", catre: "To",
        contact: "Contact person", tel: "Phone", col_den: "Item", col_amb: "Packaging", col_cant: "Qty, kg",
        col_pret: "Price / kg", col_suma: "Amount", subtotal: "Subtotal", reducere: "Discount", total: "Total",
        livrare: "Delivery terms", plata: "Payment terms", note: "Notes", manager: "Manager", semn: "Signature" },
};

const kg = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const price = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function QuoteDoc({ d, lang }: { d: Q; lang: Lang }) {
  const L = QT_T[lang];
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-row">
        <div>{L.nr}: <strong>{dash(d.doc_number)}</strong></div>
        <div>{L.data}: <strong>{dash(d.doc_date)}</strong></div>
        {d.valid_until && <div>{L.valid}: <strong>{d.valid_until}</strong></div>}
      </div>
      <div className="parties">
        <div className="party">
          <div className="title">{L.furnizor}</div>
          <div><strong>{dash(d.company_name)}</strong></div>
          <div>{d.company_address}</div>
          {d.company_idno && <div>IDNO: {d.company_idno}</div>}
          {(d.company_phone || d.company_email) && <div>{[d.company_phone, d.company_email].filter(Boolean).join(" · ")}</div>}
        </div>
        <div className="party">
          <div className="title">{L.catre}</div>
          <div><strong>{dash(d.client_name)}</strong></div>
          {d.client_address && <div>{d.client_address}</div>}
          {d.client_idno && <div>IDNO: {d.client_idno}</div>}
          {d.contact_person && <div>{L.contact}: {d.contact_person}</div>}
          {(d.phone || d.email) && <div>{[d.phone && `${L.tel} ${d.phone}`, d.email].filter(Boolean).join(" · ")}</div>}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>{L.col_den}</th><th>{L.col_amb}</th><th className="num">{L.col_cant}</th><th className="num">{L.col_pret}</th><th className="num">{L.col_suma}, {d.currency}</th></tr></thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}><td>{i + 1}</td><td>{l.description}{l.item_code && <div style={{ fontSize: "9pt", color: "#666" }}>{l.item_code}</div>}</td>
              <td>{dash(l.packaging)}</td><td className="num">{kg(l.qty_kg)}</td><td className="num">{price(l.price_per_kg)}</td><td className="num">{f2(l.amount)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          {d.discount_pct > 0 && <>
            <tr><td colSpan={5} className="num">{L.subtotal}</td><td className="num">{f2(d.subtotal)}</td></tr>
            <tr><td colSpan={5} className="num">{L.reducere} {d.discount_pct}%</td><td className="num">−{f2(d.discount_amount)}</td></tr>
          </>}
          <tr className="total-row"><td colSpan={5} className="num">{L.total}</td><td className="num">{f2(d.total)} {d.currency}</td></tr>
        </tfoot>
      </table>
      {d.delivery_terms && <div className="boxed"><strong>{L.livrare}:</strong> {d.delivery_terms}</div>}
      {d.payment_terms && <div className="boxed"><strong>{L.plata}:</strong> {d.payment_terms}</div>}
      {d.notes && <div className="boxed" style={{ whiteSpace: "pre-wrap" }}><strong>{L.note}:</strong> {d.notes}</div>}
      <div className="doc-row" style={{ marginTop: 32 }}>
        <div>{L.manager}: <strong>{dash(d.manager_name)}</strong></div>
        <div>{L.semn}: ____________________</div>
      </div>
    </div>
  );
}
