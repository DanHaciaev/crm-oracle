// Customer returns (AGRO_SALES_RETURNS / _LINES) — read side. Returns are
// created and cancelled in DIPP FRUICT (create_sales_return puts the kg back
// on the batch and logs a 'return' stock movement), so the CRM only lists,
// inspects, prints and exports them.
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

export interface ReturnFilters {
  date_from: string | null; date_to: string | null;
  customer_id: number | null; item_id: number | null;
  status: "active" | "cancelled" | null; q: string | null;
}

export function parseReturnFilters(sp: URLSearchParams): ReturnFilters {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const id = (k: string) => { const v = Number(sp.get(k)); return v > 0 ? v : null; };
  const st = sp.get("status");
  return {
    date_from: d("date_from"), date_to: d("date_to"),
    customer_id: id("customer_id"), item_id: id("item_id"),
    status: st === "active" || st === "cancelled" ? st : null,
    q: (sp.get("q") ?? "").trim().slice(0, 60) || null,
  };
}

function where(f: ReturnFilters) {
  const w: string[] = [];
  const binds: Record<string, string | number> = {};
  if (f.date_from)   { w.push("r.RETURN_DATE >= TO_DATE(:dfrom, 'YYYY-MM-DD')"); binds.dfrom = f.date_from; }
  if (f.date_to)     { w.push("r.RETURN_DATE < TO_DATE(:dto, 'YYYY-MM-DD') + 1"); binds.dto = f.date_to; }
  if (f.customer_id) { w.push("sd.CUSTOMER_ID = :cust"); binds.cust = f.customer_id; }
  if (f.status)      { w.push("NVL(r.STATUS, 'active') = :st"); binds.st = f.status; }
  if (f.item_id)     { w.push("EXISTS (SELECT 1 FROM AGRO_SALES_RETURN_LINES x JOIN AGRO_SALES_LINES y ON y.ID = x.SALES_LINE_ID WHERE x.RETURN_ID = r.ID AND y.ITEM_ID = :item)"); binds.item = f.item_id; }
  if (f.q) {
    w.push("(UPPER(r.RETURN_NUMBER) LIKE :q OR UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q OR UPPER(c.NAME) LIKE :q OR UPPER(r.REASON) LIKE :q)");
    binds.q = `%${f.q.toUpperCase()}%`;
  }
  return { sql: w.length ? "WHERE " + w.join(" AND ") : "", binds };
}

export async function listReturns(f: ReturnFilters, lang: Lang) {
  const w = where(f);
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT r.ID, r.RETURN_NUMBER, r.RETURN_DATE, r.REASON, r.CREATED_BY, NVL(r.STATUS, 'active') AS STATUS,
             r.CANCELLED_BY, r.CANCELLED_AT,
             sd.ID AS SALES_ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE AS SALE_DATE,
             NVL(sd.CURRENCY_CODE, 'MDL') AS CURRENCY_CODE,
             c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
             (SELECT NVL(SUM(l.QTY_KG), 0) FROM AGRO_SALES_RETURN_LINES l WHERE l.RETURN_ID = r.ID) AS QTY_KG,
             (SELECT NVL(SUM(l.AMOUNT), 0) FROM AGRO_SALES_RETURN_LINES l WHERE l.RETURN_ID = r.ID) AS AMOUNT,
             -- MDL value: returned kg at the sales line's MDL price per kg.
             (SELECT NVL(SUM(l.QTY_KG * sl.AMOUNT_MDL / NULLIF(sl.NET_WEIGHT_KG, 0)), 0)
                FROM AGRO_SALES_RETURN_LINES l JOIN AGRO_SALES_LINES sl ON sl.ID = l.SALES_LINE_ID
               WHERE l.RETURN_ID = r.ID) AS AMOUNT_MDL,
             (SELECT LISTAGG(x.NM, ', ') WITHIN GROUP (ORDER BY x.NM)
                FROM (SELECT DISTINCT l.RETURN_ID, i.NAME_RO, i.NAME_RU, i.NAME_${lang === "ru" ? "RU" : "RO"} AS NM
                        FROM AGRO_SALES_RETURN_LINES l
                        JOIN AGRO_SALES_LINES sl ON sl.ID = l.SALES_LINE_ID
                        JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID) x
               WHERE x.RETURN_ID = r.ID) AS ITEMS
      FROM AGRO_SALES_RETURNS r
      LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = r.SALES_DOC_ID
      LEFT JOIN AGRO_CUSTOMERS  c  ON c.ID  = sd.CUSTOMER_ID
      ${w.sql}
      ORDER BY r.RETURN_DATE DESC, r.ID DESC
    ) WHERE ROWNUM <= 2000
  `, w.binds);

  const list = rows.map(r => ({
    id: n(r.ID), return_number: s(r.RETURN_NUMBER), return_date: iso(r.RETURN_DATE),
    reason: s(r.REASON), created_by: s(r.CREATED_BY), status: s(r.STATUS),
    cancelled_by: s(r.CANCELLED_BY), cancelled_at: iso(r.CANCELLED_AT),
    sales_id: r.SALES_ID ? n(r.SALES_ID) : null, sale_number: s(r.INVOICE_NUMBER) || s(r.DOC_NUMBER),
    sale_date: iso(r.SALE_DATE), currency_code: s(r.CURRENCY_CODE),
    customer_id: r.CUSTOMER_ID ? n(r.CUSTOMER_ID) : null, customer_name: s(r.CUSTOMER_NAME),
    qty_kg: n(r.QTY_KG), amount: n(r.AMOUNT), amount_mdl: n(r.AMOUNT_MDL), items: s(r.ITEMS),
  }));

  const active = list.filter(r => r.status !== "cancelled");
  return {
    rows: list,
    totals: {
      count: active.length, qty_kg: active.reduce((a, r) => a + r.qty_kg, 0),
      amount_mdl: active.reduce((a, r) => a + r.amount_mdl, 0),
      cancelled: list.length - active.length,
      customers: new Set(active.map(r => r.customer_id).filter(Boolean)).size,
    },
  };
}

export async function returnDetail(id: number, lang: Lang) {
  const [hdr, lines] = await Promise.all([
    query<Row>(`
      SELECT r.ID, r.RETURN_NUMBER, r.RETURN_DATE, r.REASON, r.CREATED_BY, NVL(r.STATUS, 'active') AS STATUS,
             r.CANCELLED_BY, r.CANCELLED_AT, r.CANCELLED_QTY_KG,
             sd.ID AS SALES_ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE AS SALE_DATE,
             NVL(sd.CURRENCY_CODE, 'MDL') AS CURRENCY_CODE, w.NAME AS WAREHOUSE_NAME,
             c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME, c.ADDRESS AS CUSTOMER_ADDRESS, c.TAX_ID AS CUSTOMER_TAX_ID
      FROM AGRO_SALES_RETURNS r
      LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = r.SALES_DOC_ID
      LEFT JOIN AGRO_CUSTOMERS  c  ON c.ID  = sd.CUSTOMER_ID
      LEFT JOIN AGRO_WAREHOUSES w  ON w.ID  = sd.WAREHOUSE_ID
      WHERE r.ID = :1
    `, [id]),
    query<Row>(`
      SELECT l.ID, l.QTY_KG, l.AMOUNT, b.ID AS BATCH_ID, b.BATCH_NUMBER,
             i.NAME_RO, i.NAME_RU, sl.PRICE_PER_KG, sl.NET_WEIGHT_KG AS SOLD_KG
      FROM AGRO_SALES_RETURN_LINES l
      LEFT JOIN AGRO_SALES_LINES sl ON sl.ID = l.SALES_LINE_ID
      LEFT JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
      LEFT JOIN AGRO_BATCHES b ON b.ID = l.BATCH_ID
      WHERE l.RETURN_ID = :1
      ORDER BY l.ID
    `, [id]),
  ]);
  if (!hdr.length) return null;
  const h = hdr[0];
  const ls = lines.map(l => ({
    id: n(l.ID), item_name: pickName(lang, l.NAME_RO, l.NAME_RU),
    batch_id: l.BATCH_ID ? n(l.BATCH_ID) : null, batch_number: s(l.BATCH_NUMBER),
    qty_kg: n(l.QTY_KG), amount: n(l.AMOUNT), price_per_kg: n(l.PRICE_PER_KG), sold_kg: n(l.SOLD_KG),
  }));
  return {
    id: n(h.ID), return_number: s(h.RETURN_NUMBER), return_date: iso(h.RETURN_DATE),
    reason: s(h.REASON), created_by: s(h.CREATED_BY), status: s(h.STATUS),
    cancelled_by: s(h.CANCELLED_BY), cancelled_at: iso(h.CANCELLED_AT),
    cancelled_qty_kg: h.CANCELLED_QTY_KG != null ? n(h.CANCELLED_QTY_KG) : null,
    sales_id: h.SALES_ID ? n(h.SALES_ID) : null, sale_number: s(h.INVOICE_NUMBER) || s(h.DOC_NUMBER),
    sale_date: iso(h.SALE_DATE), currency_code: s(h.CURRENCY_CODE), warehouse_name: s(h.WAREHOUSE_NAME),
    customer_id: h.CUSTOMER_ID ? n(h.CUSTOMER_ID) : null, customer_name: s(h.CUSTOMER_NAME),
    customer_address: s(h.CUSTOMER_ADDRESS), customer_tax_id: s(h.CUSTOMER_TAX_ID),
    lines: ls,
    total_qty_kg: ls.reduce((a, l) => a + l.qty_kg, 0),
    total_amount: ls.reduce((a, l) => a + l.amount, 0),
  };
}
