import { returnDetail } from "@/lib/returns";
import { DocNotFound, fmtDate, getCompany, type Lang } from "./common";

// ── Act de restituire (customer return act) ──────────────────────────────
// Printed from the Returns page; data from the return DIPP FRUICT recorded.
export async function returnAct(id: number, lang: Lang) {
  const [d, company] = await Promise.all([returnDetail(id, lang), getCompany()]);
  if (!d) throw new DocNotFound("Возврат не найден");
  return {
    company_name: company.name, company_address: company.address, company_idno: company.fiscal_code,
    doc_number: d.return_number, doc_date: fmtDate(d.return_date), status: d.status,
    sale_number: d.sale_number, sale_date: fmtDate(d.sale_date), warehouse_name: d.warehouse_name,
    customer_name: d.customer_name, customer_address: d.customer_address, customer_idno: d.customer_tax_id,
    currency_code: d.currency_code, reason: d.reason,
    lines: d.lines.map(l => ({ item_name: l.item_name, batch_number: l.batch_number, qty_kg: l.qty_kg, price_per_kg: l.price_per_kg, amount: l.amount })),
    total_qty_kg: d.total_qty_kg, total_amount: d.total_amount,
  };
}
