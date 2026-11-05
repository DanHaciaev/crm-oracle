// Export declarations (DIPP FRUICT Vânzări → «Декларации», AGRO_EXPORT_DECLS)
// — the list; each one is printed from its sale (documents → export_decl).
// Filled in DIPP FRUICT, read-only here.
import { query } from "@/lib/oracle";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function listExportDecls(sp: URLSearchParams) {
  const w: string[] = [];
  const b: Record<string, string> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "";
  if (ISO.test(df)) { w.push("e.DECL_DATE >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("e.DECL_DATE < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  const st = (sp.get("status") ?? "").trim();
  if (st) { w.push("NVL(e.STATUS, 'draft') = :st"); b.st = st.slice(0, 20); }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) {
    w.push("(UPPER(e.DECL_NUMBER) LIKE :q OR UPPER(e.PHYTO_CERT_NUMBER) LIKE :q OR UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q OR UPPER(c.NAME) LIKE :q)");
    b.q = `%${q.toUpperCase()}%`;
  }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT e.ID, e.DECL_NUMBER, e.DECL_DATE, e.CUSTOMS_WEIGHT_KG, e.DESTINATION_COUNTRY, e.CUSTOMS_CODE, NVL(e.STATUS, 'draft') AS STATUS,
             e.NOTES, e.TRANSPORT_MODE, e.PORT_OF_EXIT, e.PHYTO_CERT_NUMBER, e.PHYTO_CERT_DATE,
             sd.ID AS SALES_ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS SALE_NUMBER, sd.DOC_DATE AS SALE_DATE, sd.TOTAL_NET_KG,
             c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME
      FROM AGRO_EXPORT_DECLS e
      LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = e.SALES_DOC_ID
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY e.DECL_DATE DESC NULLS LAST, e.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  // Export sales without a declaration yet — DIPP FRUICT prints a blank for them.
  const missing = await query<Row>(`
    SELECT COUNT(*) AS N FROM AGRO_SALES_DOCS sd
    WHERE sd.SALE_TYPE = 'export' AND sd.STATUS IN ('confirmed', 'shipped')
      AND NOT EXISTS (SELECT 1 FROM AGRO_EXPORT_DECLS e WHERE e.SALES_DOC_ID = sd.ID)`, []);
  return {
    rows: rows.map(r => ({
      id: n(r.ID), number: s(r.DECL_NUMBER), date: iso(r.DECL_DATE), customs_kg: nn(r.CUSTOMS_WEIGHT_KG),
      country: s(r.DESTINATION_COUNTRY), customs_code: s(r.CUSTOMS_CODE), status: s(r.STATUS), notes: s(r.NOTES),
      transport: s(r.TRANSPORT_MODE), port: s(r.PORT_OF_EXIT), phyto_number: s(r.PHYTO_CERT_NUMBER), phyto_date: iso(r.PHYTO_CERT_DATE),
      sales_id: nn(r.SALES_ID), sale_number: s(r.SALE_NUMBER), sale_date: iso(r.SALE_DATE), net_kg: nn(r.TOTAL_NET_KG),
      customer_id: nn(r.CUSTOMER_ID), customer_name: s(r.CUSTOMER_NAME),
    })),
    export_without_decl: n(missing[0]?.N),
  };
}
