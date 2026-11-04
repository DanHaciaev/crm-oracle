// Excel/CSV reports ported from DIPP FRUICT (AgroStore.report_* +
// /api/agro-admin/reports/export/<type>). Each report declares its filters,
// its columns (in print order, with a type that drives formatting and
// totals) and a runner returning rows keyed by those column keys.
import { query } from "@/lib/oracle";
import { Lang, pickName } from "@/lib/documents/common";
import { massBalance } from "@/lib/documents/stock";
import { MOVEMENTS_SQL, MOVEMENT_TYPES, movementWhere } from "@/lib/warehouse";
import { profitabilityRows } from "@/lib/profitability";
import { receivablesSummary, listPayments } from "@/lib/receivables";

type Row = Record<string, unknown>;

export type ColType =
  | "text" | "code"            // code = translated through VALUE_LABELS
  | "date" | "datetime"
  | "kg" | "int"               // summed in the totals row
  | "num"                      // integer, not summed (e.g. days left)
  | "money"                    // summed only when every row has the same currency
  | "mdl"                      // amount converted to MDL — always summable
  | "price";

export type FilterKey = "period" | "warehouse" | "item" | "supplier" | "customer" | "status" | "days";

export interface ReportFilters {
  date_from: string | null; date_to: string | null;
  warehouse_id: number | null; item_id: number | null;
  supplier_id: number | null; customer_id: number | null;
  status: string | null; days_ahead: number;
}

export interface ReportDef {
  filters: FilterKey[];
  statuses?: string[];
  columns: [key: string, type: ColType][];
  run: (f: ReportFilters, lang: Lang) => Promise<Row[]>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_RE = /^[a-z_]{1,30}$/;

export function parseFilters(sp: URLSearchParams): ReportFilters {
  const id = (k: string) => { const v = Number(sp.get(k)); return v > 0 ? v : null; };
  const date = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const status = sp.get("status") ?? "";
  const days = Number(sp.get("days_ahead"));
  return {
    date_from: date("date_from"), date_to: date("date_to"),
    warehouse_id: id("warehouse_id"), item_id: id("item_id"),
    supplier_id: id("supplier_id"), customer_id: id("customer_id"),
    status: STATUS_RE.test(status) ? status : null,
    days_ahead: days > 0 && days <= 3650 ? Math.floor(days) : 30,
  };
}

// Builds "AND …" clauses + named binds for the filters a report supports.
// `cols` maps a filter to the SQL expression it applies to.
function where(f: ReportFilters, cols: Partial<Record<"date" | "warehouse" | "item" | "supplier" | "customer" | "status", string>>) {
  const sql: string[] = [];
  const binds: Record<string, string | number> = {};
  if (cols.date && f.date_from) { sql.push(`${cols.date} >= TO_DATE(:dfrom, 'YYYY-MM-DD')`); binds.dfrom = f.date_from; }
  if (cols.date && f.date_to)   { sql.push(`${cols.date} < TO_DATE(:dto, 'YYYY-MM-DD') + 1`); binds.dto = f.date_to; }
  if (cols.warehouse && f.warehouse_id) { sql.push(`${cols.warehouse} = :wh`);   binds.wh = f.warehouse_id; }
  if (cols.item && f.item_id)           { sql.push(`${cols.item} = :item`);      binds.item = f.item_id; }
  if (cols.supplier && f.supplier_id)   { sql.push(`${cols.supplier} = :sup`);   binds.sup = f.supplier_id; }
  if (cols.customer && f.customer_id)   { sql.push(`${cols.customer} = :cust`);  binds.cust = f.customer_id; }
  if (cols.status && f.status)          { sql.push(`${cols.status} = :status`);  binds.status = f.status; }
  return { sql: sql.map(s => ` AND ${s}`).join(""), binds };
}

// Lower-cases Oracle's column names and resolves *_RO/*_RU name pairs to the
// print language (EN uses RO — AGRO_ITEMS has no English names).
function norm(rows: Row[], lang: Lang): Row[] {
  return rows.map(r => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r)) o[k.toLowerCase()] = v;
    for (const base of ["item_name", "variety_name"]) {
      if (`${base}_ro` in o || `${base}_ru` in o) {
        o[base] = pickName(lang, o[`${base}_ro`], o[`${base}_ru`]) || null;
        delete o[`${base}_ro`]; delete o[`${base}_ru`];
      }
    }
    return o;
  });
}

const DOC_STATUSES   = ["draft", "confirmed", "shipped", "delivered", "closed", "returned", "cancelled"];
const BATCH_STATUSES = ["active", "blocked", "depleted"];

export const REPORTS: Record<string, ReportDef> = {
  // ── Purchases (one row per document) ──
  purchases: {
    filters: ["period", "supplier", "warehouse", "status"],
    statuses: ["draft", "confirmed", "closed", "cancelled"],
    columns: [
      ["doc_number", "text"], ["doc_date", "date"], ["supplier_name", "text"], ["warehouse_name", "text"],
      ["status", "code"], ["total_gross_kg", "kg"], ["total_net_kg", "kg"], ["total_amount", "money"],
      ["currency_code", "text"], ["total_amount_mdl", "mdl"], ["is_own_production", "code"],
      ["created_by", "text"], ["created_at", "datetime"],
    ],
    run: async (f, lang) => {
      const w = where(f, { date: "pd.DOC_DATE", supplier: "pd.SUPPLIER_ID", warehouse: "pd.WAREHOUSE_ID", status: "pd.STATUS" });
      return norm(await query<Row>(`
        SELECT pd.DOC_NUMBER, pd.DOC_DATE, s.NAME AS SUPPLIER_NAME, w.NAME AS WAREHOUSE_NAME, pd.STATUS,
               pd.TOTAL_GROSS_KG, pd.TOTAL_NET_KG, pd.TOTAL_AMOUNT,
               NVL(pd.CURRENCY_CODE, cur.CODE) AS CURRENCY_CODE, pd.TOTAL_AMOUNT_MDL,
               pd.IS_OWN_PRODUCTION, pd.CREATED_BY, pd.CREATED_AT
        FROM AGRO_PURCHASE_DOCS pd
        LEFT JOIN AGRO_SUPPLIERS  s   ON s.ID   = pd.SUPPLIER_ID
        LEFT JOIN AGRO_WAREHOUSES w   ON w.ID   = pd.WAREHOUSE_ID
        LEFT JOIN AGRO_CURRENCIES cur ON cur.ID = pd.CURRENCY_ID
        WHERE 1=1${w.sql}
        ORDER BY pd.DOC_DATE DESC, pd.ID DESC
      `, w.binds), lang);
    },
  },

  // ── Purchases at line level — one row per product per document ──
  purchase_lines: {
    filters: ["period", "supplier", "item", "warehouse", "status"],
    statuses: ["draft", "confirmed", "closed", "cancelled"],
    columns: [
      ["doc_number", "text"], ["doc_date", "date"], ["supplier_name", "text"], ["warehouse_name", "text"],
      ["status", "code"], ["item_name", "text"], ["variety_name", "text"], ["pallets", "int"], ["crates_count", "int"],
      ["gross_weight_kg", "kg"], ["tare_weight_kg", "kg"], ["net_weight_kg", "kg"], ["price_per_kg", "price"],
      ["amount", "money"], ["currency_code", "text"], ["amount_mdl", "mdl"], ["created_by", "text"], ["created_at", "datetime"],
    ],
    run: async (f, lang) => {
      const w = where(f, { date: "pd.DOC_DATE", supplier: "pd.SUPPLIER_ID", item: "pl.ITEM_ID", warehouse: "pd.WAREHOUSE_ID", status: "pd.STATUS" });
      return norm(await query<Row>(`
        SELECT pd.DOC_NUMBER, pd.DOC_DATE, s.NAME AS SUPPLIER_NAME, w.NAME AS WAREHOUSE_NAME, pd.STATUS,
               i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
               v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU,
               pl.PALLETS, pl.CRATES_COUNT, pl.GROSS_WEIGHT_KG, pl.TARE_WEIGHT_KG, pl.NET_WEIGHT_KG,
               pl.PRICE_PER_KG, pl.AMOUNT, NVL(pd.CURRENCY_CODE, cur.CODE) AS CURRENCY_CODE,
               pl.LINE_TOTAL_MDL AS AMOUNT_MDL, pd.CREATED_BY, pd.CREATED_AT
        FROM AGRO_PURCHASE_LINES pl
        JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
        LEFT JOIN AGRO_SUPPLIERS  s   ON s.ID   = pd.SUPPLIER_ID
        LEFT JOIN AGRO_WAREHOUSES w   ON w.ID   = pd.WAREHOUSE_ID
        JOIN AGRO_ITEMS i ON i.ID = pl.ITEM_ID
        LEFT JOIN AGRO_ITEM_VARIETIES v ON v.ID = pl.VARIETY_ID
        LEFT JOIN AGRO_CURRENCIES cur ON cur.ID = pd.CURRENCY_ID
        WHERE 1=1${w.sql}
        ORDER BY pd.DOC_DATE DESC, pd.ID DESC, pl.ID
      `, w.binds), lang);
    },
  },

  // ── Sales (one row per document) ──
  // DIPP FRUICT filtered AGRO_V_SALES by CUSTOMER_ID/ITEM_ID, which that view
  // doesn't have — the filters live on the tables here.
  sales: {
    filters: ["period", "customer", "warehouse", "status"],
    statuses: DOC_STATUSES,
    columns: [
      ["doc_number", "text"], ["invoice_number", "text"], ["doc_date", "date"], ["customer_name", "text"],
      ["customer_type", "code"], ["warehouse_name", "text"], ["sale_type", "code"], ["status", "code"],
      ["total_gross_kg", "kg"], ["total_net_kg", "kg"], ["total_amount", "money"], ["currency_code", "text"],
      ["total_amount_mdl", "mdl"], ["created_by", "text"], ["created_at", "datetime"],
    ],
    run: async (f, lang) => {
      const w = where(f, { date: "sd.DOC_DATE", customer: "sd.CUSTOMER_ID", warehouse: "sd.WAREHOUSE_ID", status: "sd.STATUS" });
      return norm(await query<Row>(`
        SELECT sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, c.NAME AS CUSTOMER_NAME, c.CUSTOMER_TYPE,
               w.NAME AS WAREHOUSE_NAME, sd.SALE_TYPE, sd.STATUS, sd.TOTAL_GROSS_KG, sd.TOTAL_NET_KG,
               sd.TOTAL_AMOUNT, NVL(sd.CURRENCY_CODE, cur.CODE) AS CURRENCY_CODE, sd.TOTAL_AMOUNT_MDL,
               sd.CREATED_BY, sd.CREATED_AT
        FROM AGRO_SALES_DOCS sd
        LEFT JOIN AGRO_CUSTOMERS  c   ON c.ID   = sd.CUSTOMER_ID
        LEFT JOIN AGRO_WAREHOUSES w   ON w.ID   = sd.WAREHOUSE_ID
        LEFT JOIN AGRO_CURRENCIES cur ON cur.ID = sd.CURRENCY_ID
        WHERE 1=1${w.sql}
        ORDER BY sd.DOC_DATE DESC, sd.ID DESC
      `, w.binds), lang);
    },
  },

  // ── Sales at line level, with the suppliers whose batches were shipped ──
  sales_lines: {
    filters: ["period", "customer", "item", "warehouse", "status"],
    statuses: DOC_STATUSES,
    columns: [
      ["doc_number", "text"], ["invoice_number", "text"], ["doc_date", "date"], ["customer_name", "text"],
      ["warehouse_name", "text"], ["status", "code"], ["item_name", "text"], ["variety_name", "text"],
      ["suppliers", "text"], ["pallets", "int"], ["crates_count", "int"], ["gross_weight_kg", "kg"],
      ["net_weight_kg", "kg"], ["price_per_kg", "price"], ["amount", "money"], ["currency_code", "text"],
      ["amount_mdl", "mdl"], ["created_by", "text"], ["created_at", "datetime"], ["admin_edit", "text"],
    ],
    run: async (f, lang) => {
      const w = where(f, { date: "sd.DOC_DATE", customer: "sd.CUSTOMER_ID", item: "sl.ITEM_ID", warehouse: "sd.WAREHOUSE_ID", status: "sd.STATUS" });
      return norm(await query<Row>(`
        SELECT sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, c.NAME AS CUSTOMER_NAME, w.NAME AS WAREHOUSE_NAME,
               sd.STATUS, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
               v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU,
               (SELECT LISTAGG(x.SNAME, ', ') WITHIN GROUP (ORDER BY x.SNAME)
                  FROM (SELECT DISTINCT a.SALES_LINE_ID, s.NAME AS SNAME
                          FROM AGRO_BATCH_ALLOCATIONS a
                          JOIN AGRO_BATCHES b ON b.ID = a.BATCH_ID
                          JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
                          JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
                          JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID) x
                 WHERE x.SALES_LINE_ID = sl.ID) AS SUPPLIERS,
               sl.PALLETS, sl.CRATES_COUNT, sl.GROSS_WEIGHT_KG, sl.NET_WEIGHT_KG, sl.PRICE_PER_KG, sl.AMOUNT,
               sd.CURRENCY_CODE, sl.AMOUNT_MDL, sd.CREATED_BY, sd.CREATED_AT,
               CASE WHEN sd.ADMIN_EDITED_AT IS NULL THEN NULL
                    ELSE sd.ADMIN_EDITED_BY || ' ' || TO_CHAR(sd.ADMIN_EDITED_AT, 'DD.MM.YYYY HH24:MI') || ': ' || sd.ADMIN_EDIT_NOTE
               END AS ADMIN_EDIT
        FROM AGRO_SALES_LINES sl
        JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
        LEFT JOIN AGRO_CUSTOMERS  c ON c.ID = sd.CUSTOMER_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = sd.WAREHOUSE_ID
        JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
        LEFT JOIN AGRO_ITEM_VARIETIES v ON v.ID = sl.VARIETY_ID
        WHERE 1=1${w.sql}
        ORDER BY sd.DOC_DATE DESC, sd.ID DESC, sl.ID
      `, w.binds), lang);
    },
  },

  // ── Current stock (active + blocked batches, AGRO_V_STOCK_BALANCE) ──
  stock: {
    filters: ["warehouse", "item"],
    columns: [
      ["item_name", "text"], ["item_group", "code"], ["batch_number", "text"], ["warehouse_name", "text"],
      ["cell_name", "text"], ["current_qty_kg", "kg"], ["status", "code"], ["received_at", "date"],
      ["expiry_date", "date"], ["is_expired", "code"], ["is_blocked", "code"],
    ],
    run: async (f, lang) => {
      const w = where(f, { warehouse: "b.WAREHOUSE_ID", item: "b.ITEM_ID" });
      return norm(await query<Row>(`
        SELECT i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU, i.ITEM_GROUP, b.BATCH_NUMBER,
               w.NAME AS WAREHOUSE_NAME, NVL(c.NAME, c.CODE) AS CELL_NAME, b.CURRENT_QTY_KG, b.STATUS,
               b.RECEIVED_AT, b.EXPIRY_DATE,
               CASE WHEN b.EXPIRY_DATE < TRUNC(SYSDATE) THEN 'Y' ELSE 'N' END AS IS_EXPIRED,
               CASE WHEN b.STATUS = 'blocked' THEN 'Y' ELSE 'N' END AS IS_BLOCKED
        FROM AGRO_BATCHES b
        JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
        LEFT JOIN AGRO_STORAGE_CELLS c ON c.ID = b.CELL_ID
        WHERE b.STATUS IN ('active', 'blocked')${w.sql}
        ORDER BY i.NAME_RU, w.NAME, b.RECEIVED_AT
      `, w.binds), lang);
    },
  },

  // ── Lot-level stock: received / sold / reserved / free + packaging left ──
  // Exhausted batches are included on purpose (client wants the totals).
  stock_batches: {
    filters: ["period", "warehouse", "item", "supplier", "status"],
    statuses: BATCH_STATUSES,
    columns: [
      ["batch_number", "text"], ["item_name", "text"], ["variety_name", "text"], ["supplier_name", "text"],
      ["warehouse_name", "text"], ["cell_name", "text"], ["initial_qty_kg", "kg"], ["realized_qty_kg", "kg"],
      ["current_qty_kg", "kg"], ["reserved_qty_kg", "kg"], ["free_qty_kg", "kg"], ["crates_count", "int"],
      ["crates_left", "int"], ["pallets", "int"], ["pallets_left", "int"], ["status", "code"],
    ],
    run: async (f, lang) => {
      // Period = purchase document date, as in DIPP FRUICT get_stock_balance.
      const w = where(f, { date: "pd.DOC_DATE", warehouse: "b.WAREHOUSE_ID", item: "b.ITEM_ID", supplier: "s.ID", status: "b.STATUS" });
      const rows = norm(await query<Row>(`
        SELECT b.BATCH_NUMBER, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
               v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU,
               s.NAME AS SUPPLIER_NAME, w.NAME AS WAREHOUSE_NAME, NVL(c.NAME, c.CODE) AS CELL_NAME,
               b.INITIAL_QTY_KG, NVL(shp.QTY, 0) AS REALIZED_QTY_KG, b.CURRENT_QTY_KG,
               NVL(rsv.QTY, 0) AS RESERVED_QTY_KG,
               GREATEST(0, NVL(b.CURRENT_QTY_KG, 0) - NVL(rsv.QTY, 0)) AS FREE_QTY_KG,
               pl.CRATES_COUNT, pl.PALLETS, b.STATUS
        FROM AGRO_BATCHES b
        LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
        LEFT JOIN AGRO_STORAGE_CELLS c ON c.ID = b.CELL_ID
        LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
        LEFT JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
        LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
        LEFT JOIN AGRO_ITEM_VARIETIES v ON v.ID = NVL(pl.VARIETY_ID, b.VARIETY_ID)
        LEFT JOIN (SELECT a.BATCH_ID, SUM(a.ALLOCATED_QTY_KG) AS QTY
                     FROM AGRO_BATCH_ALLOCATIONS a
                     JOIN AGRO_SALES_LINES sl ON sl.ID = a.SALES_LINE_ID
                     JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
                    WHERE sd.STATUS IN ('draft', 'confirmed')
                    GROUP BY a.BATCH_ID) rsv ON rsv.BATCH_ID = b.ID
        LEFT JOIN (SELECT a.BATCH_ID, SUM(a.ALLOCATED_QTY_KG) AS QTY
                     FROM AGRO_BATCH_ALLOCATIONS a
                     JOIN AGRO_SALES_LINES sl ON sl.ID = a.SALES_LINE_ID
                     JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
                    WHERE sd.STATUS = 'shipped'
                    GROUP BY a.BATCH_ID) shp ON shp.BATCH_ID = b.ID
        WHERE 1=1${w.sql}
        ORDER BY i.NAME_RU, w.NAME, b.BATCH_NUMBER
      `, w.binds), lang);
      // Crates/pallets are only recorded on receipt — scale them with the kg
      // still in the batch so a sold-out batch stops showing packaging
      // (client audit: "lazile nu se casează la realizare").
      for (const r of rows) {
        const initial = Number(r.initial_qty_kg ?? 0), cur = Number(r.current_qty_kg ?? 0);
        let ratio = initial > 0 ? Math.max(0, Math.min(1, cur / initial)) : cur > 0 ? 1 : 0;
        if (r.status === "depleted" || cur <= 0) ratio = 0;
        r.crates_left  = Math.round(Number(r.crates_count ?? 0) * ratio);
        r.pallets_left = Math.round(Number(r.pallets ?? 0) * ratio);
      }
      return rows;
    },
  },

  // ── Current stock grouped by the supplier each batch was bought from ──
  stock_by_supplier: {
    filters: ["warehouse", "item"],
    columns: [
      ["supplier_name", "text"], ["supplier_code", "text"], ["item_name", "text"], ["item_code", "text"],
      ["warehouse_name", "text"], ["current_stock_kg", "kg"], ["batch_count", "int"],
    ],
    run: async (f, lang) => {
      const w = where(f, { warehouse: "b.WAREHOUSE_ID", item: "b.ITEM_ID" });
      return norm(await query<Row>(`
        SELECT s.NAME AS SUPPLIER_NAME, s.CODE AS SUPPLIER_CODE,
               i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU, i.CODE AS ITEM_CODE,
               w.NAME AS WAREHOUSE_NAME, SUM(b.CURRENT_QTY_KG) AS CURRENT_STOCK_KG, COUNT(*) AS BATCH_COUNT
        FROM AGRO_BATCHES b
        JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
        LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
        LEFT JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
        LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
        WHERE b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0${w.sql}
        GROUP BY s.NAME, s.CODE, i.NAME_RO, i.NAME_RU, i.CODE, w.NAME
        ORDER BY i.NAME_RU, s.NAME
      `, w.binds), lang);
    },
  },

  // ── Mass balance for a period (same calculation as the printed document;
  //    DIPP FRUICT's version was all-time only and ignored its warehouse filter) ──
  mass_balance: {
    filters: ["period", "warehouse"],
    columns: [
      ["item_name", "text"], ["opening_kg", "kg"], ["received_kg", "kg"], ["shipped_kg", "kg"],
      ["waste_kg", "kg"], ["loss_kg", "kg"], ["closing_kg", "kg"], ["change_kg", "kg"],
    ],
    run: async (f, lang) => {
      const today = new Date();
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const mb = await massBalance({
        date_from: f.date_from ?? iso(new Date(today.getFullYear(), today.getMonth(), 1)),
        date_to: f.date_to ?? iso(today),
        warehouse_id: f.warehouse_id,
      }, lang);
      return mb.items.map(it => ({
        item_name: it.item_name, opening_kg: it.opening_qty_kg, received_kg: it.received_qty_kg,
        shipped_kg: it.shipped_qty_kg, waste_kg: it.waste_qty_kg, loss_kg: it.loss_qty_kg,
        closing_kg: it.closing_qty_kg, change_kg: it.balance_diff,
      }));
    },
  },

  // ── Stock movements journal (warehouse section's "Movements" tab).
  //    The status filter carries the movement type here. ──
  movements: {
    filters: ["period", "warehouse", "item", "status"],
    statuses: MOVEMENT_TYPES,
    columns: [
      ["created_at", "datetime"], ["movement_type", "code"], ["batch_number", "text"], ["item_name", "text"],
      ["qty_kg", "kg"], ["from_warehouse", "text"], ["to_warehouse", "text"], ["doc_ref", "text"],
      ["reason", "text"], ["created_by", "text"],
    ],
    run: async (f, lang) => {
      const w = movementWhere({ date_from: f.date_from, date_to: f.date_to, type: f.status,
                                warehouse_id: f.warehouse_id, item_id: f.item_id, q: null });
      return norm(await query<Row>(MOVEMENTS_SQL(w.sql), w.binds), lang);
    },
  },

  // ── Receivables: debt per customer and currency with aging. ──
  receivables: {
    filters: [],
    columns: [
      ["customer_name", "text"], ["currency_code", "text"], ["billed", "money"], ["returned_amount", "money"], ["paid", "money"],
      ["balance", "money"], ["balance_mdl", "mdl"], ["overdue", "money"], ["overdue_mdl", "mdl"],
      ["aging_not_due", "money"], ["aging_1_30", "money"], ["aging_31_60", "money"], ["aging_61_90", "money"], ["aging_90_plus", "money"],
      ["open_docs", "int"], ["oldest_overdue_days", "num"], ["payment_days", "num"], ["credit_limit_mdl", "mdl"], ["last_payment", "date"],
    ],
    run: async () => (await receivablesSummary()).rows.map(r => ({
      customer_name: r.customer_name, currency_code: r.currency, billed: r.billed, returned_amount: r.returned, paid: r.paid,
      balance: r.balance, balance_mdl: r.balance_mdl, overdue: r.overdue, overdue_mdl: r.overdue_mdl,
      aging_not_due: r.aging.not_due, aging_1_30: r.aging.d1_30, aging_31_60: r.aging.d31_60, aging_61_90: r.aging.d61_90, aging_90_plus: r.aging.d90_plus,
      open_docs: r.open_docs, oldest_overdue_days: r.oldest_overdue_days, payment_days: r.payment_days, credit_limit_mdl: r.credit_limit_mdl,
      last_payment: r.last_payment,
    })),
  },

  // ── Customer payments journal. ──
  payments: {
    filters: ["period", "customer"],
    columns: [
      ["payment_number", "text"], ["pay_date", "date"], ["customer_name", "text"], ["doc_number", "text"], ["amount", "money"],
      ["currency_code", "text"], ["amount_mdl", "mdl"], ["method", "code"], ["reference", "text"], ["payment_status", "code"],
      ["created_by", "text"], ["notes", "text"],
    ],
    run: async f => (await listPayments({ date_from: f.date_from, date_to: f.date_to, customer_id: f.customer_id, method: null, status: null, q: null }))
      .map(p => ({ payment_number: p.number, pay_date: p.date, customer_name: p.customer_name, doc_number: p.sale_number,
                   amount: p.amount, currency_code: p.currency, amount_mdl: p.amount_mdl, method: p.method, reference: p.reference,
                   payment_status: p.status, created_by: p.created_by, notes: p.notes })),
  },

  // ── Customer returns, one row per returned line (returns page export). ──
  returns: {
    filters: ["period", "customer", "item"],
    columns: [
      ["return_number", "text"], ["return_date", "date"], ["return_status", "code"], ["doc_number", "text"],
      ["customer_name", "text"], ["item_name", "text"], ["batch_number", "text"], ["qty_kg", "kg"],
      ["amount", "money"], ["currency_code", "text"], ["amount_mdl", "mdl"], ["reason", "text"], ["created_by", "text"],
    ],
    run: async (f, lang) => {
      const w = where(f, { date: "r.RETURN_DATE", customer: "sd.CUSTOMER_ID", item: "sl.ITEM_ID" });
      return norm(await query<Row>(`
        SELECT r.RETURN_NUMBER, r.RETURN_DATE, NVL(r.STATUS, 'active') AS RETURN_STATUS,
               NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS DOC_NUMBER, c.NAME AS CUSTOMER_NAME,
               i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU, b.BATCH_NUMBER,
               l.QTY_KG, l.AMOUNT, NVL(sd.CURRENCY_CODE, 'MDL') AS CURRENCY_CODE,
               l.QTY_KG * sl.AMOUNT_MDL / NULLIF(sl.NET_WEIGHT_KG, 0) AS AMOUNT_MDL,
               r.REASON, r.CREATED_BY
        FROM AGRO_SALES_RETURN_LINES l
        JOIN AGRO_SALES_RETURNS r ON r.ID = l.RETURN_ID
        LEFT JOIN AGRO_SALES_LINES sl ON sl.ID = l.SALES_LINE_ID
        LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = r.SALES_DOC_ID
        LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
        LEFT JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
        LEFT JOIN AGRO_BATCHES b ON b.ID = l.BATCH_ID
        WHERE 1=1${w.sql}
        ORDER BY r.RETURN_DATE DESC, r.ID DESC, l.ID
      `, w.binds), lang);
    },
  },

  // ── Batch profitability (Excel export of the Profitability page).
  //    cost / margin stay empty where the purchase has no price yet. ──
  profitability: {
    filters: ["period", "warehouse", "item", "supplier", "customer"],
    columns: [
      ["batch_number", "text"], ["item_supplier", "text"], ["origin", "code"], ["sold_kg", "kg"],
      ["revenue", "mdl"], ["cost_per_kg", "price"], ["cost", "mdl"], ["margin", "mdl"], ["margin_pct", "price"],
    ],
    run: (f, lang) => profitabilityRows(f, lang),
  },

  // ── Batches expiring within N days (already expired ones included) ──
  expiry: {
    filters: ["days", "warehouse", "item"],
    columns: [
      ["batch_number", "text"], ["item_name", "text"], ["warehouse_name", "text"], ["current_qty_kg", "kg"],
      ["status", "code"], ["expiry_date", "date"], ["days_remaining", "num"],
    ],
    run: async (f, lang) => {
      const w = where(f, { warehouse: "b.WAREHOUSE_ID", item: "b.ITEM_ID" });
      return norm(await query<Row>(`
        SELECT b.BATCH_NUMBER, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU, w.NAME AS WAREHOUSE_NAME,
               b.CURRENT_QTY_KG, b.STATUS, b.EXPIRY_DATE, ROUND(b.EXPIRY_DATE - SYSDATE) AS DAYS_REMAINING
        FROM AGRO_BATCHES b
        LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
        WHERE b.EXPIRY_DATE IS NOT NULL
          AND b.EXPIRY_DATE <= SYSDATE + :days
          AND b.STATUS != 'depleted'${w.sql}
        ORDER BY b.EXPIRY_DATE ASC
      `, { ...w.binds, days: f.days_ahead }), lang);
    },
  },
};
