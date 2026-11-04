import { reconciliation } from "@/lib/receivables";
import { parsePeriod } from "./stock";
import { DocNotFound, fmtDate, getCompany } from "./common";

// ── Act de verificare / акт сверки ───────────────────────────────────────
// ?customer_id=…&currency=…&date_from=…&date_to=…
export async function reconciliationAct(sp: URLSearchParams) {
  const customerId = Number(sp.get("customer_id"));
  const currency = (sp.get("currency") ?? "MDL").toUpperCase();
  if (!(customerId > 0) || !/^[A-Z]{3}$/.test(currency)) throw new DocNotFound("Не указан клиент или валюта");
  const p = parsePeriod(sp);
  const [r, company] = await Promise.all([reconciliation(customerId, currency, p.date_from, p.date_to), getCompany()]);
  if (!r.customer_name) throw new DocNotFound("Клиент не найден");
  return {
    ...r, company_name: company.name, company_address: company.address, company_idno: company.fiscal_code,
    company_director: company.director, company_accountant: company.accountant,
    date_from: fmtDate(new Date(`${p.date_from}T00:00:00`)), date_to: fmtDate(new Date(`${p.date_to}T00:00:00`)),
    rows: r.rows.map(x => ({ ...x, date: fmtDate(x.date) })),
  };
}
