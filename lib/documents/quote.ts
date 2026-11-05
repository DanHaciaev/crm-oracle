import { quoteDetail } from "@/lib/quotes";
import { DocNotFound, fmtDate, getCompany, type Lang } from "./common";

// ── Ofertă comercială / коммерческое предложение (HTML print form) ───────
// The same quote is also available as a PDF file: /api/quotes/[id]/pdf.
export async function quoteDoc(id: number, lang: Lang) {
  const [q, company] = await Promise.all([quoteDetail(id, lang), getCompany()]);
  if (!q) throw new DocNotFound("КП не найдено");
  return {
    company_name: company.name, company_address: company.address, company_idno: company.fiscal_code,
    company_phone: company.phone, company_email: company.email,
    doc_number: q.number, doc_date: fmtDate(q.date), valid_until: fmtDate(q.valid_until), status: q.status,
    client_name: q.client_name, client_address: q.customer_address, client_idno: q.customer_tax_id,
    contact_person: q.contact_person, phone: q.phone, email: q.email, currency: q.currency,
    lines: q.lines.map(l => ({ description: l.description, item_code: l.item_code, packaging: l.packaging, qty_kg: l.qty_kg, price_per_kg: l.price_per_kg, amount: l.amount })),
    subtotal: q.subtotal, discount_pct: q.discount_pct, discount_amount: q.discount_amount, total: q.total,
    delivery_terms: q.delivery_terms, payment_terms: q.payment_terms, notes: q.notes, manager_name: q.manager_name,
  };
}
