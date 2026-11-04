// Read side of the warehouse section + its two safe actions (block/unblock a
// batch, acknowledge a storage alert). Stock movements themselves are made
// in DIPP FRUICT — the single source of truth for kilograms — so nothing here
// changes quantities. Block/unblock mirror DIPP FRUICT's AgroStore.block_batch /
// unblock_batch exactly, so both systems see the same AGRO_BATCH_BLOCKS rows.
import { query, getConnection } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;

const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

// ── Overview ─────────────────────────────────────────────────────────────
export async function overview(lang: Lang) {
  const [tot, byWh, byItem] = await Promise.all([
    query<Row>(`
      SELECT NVL(SUM(CASE WHEN b.STATUS IN ('active','blocked') THEN b.CURRENT_QTY_KG END), 0) AS STOCK_KG,
             NVL(SUM(CASE WHEN b.STATUS = 'active' THEN NVL(rsv.QTY, 0) END), 0)            AS RESERVED_KG,
             COUNT(CASE WHEN b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 THEN 1 END)        AS ACTIVE_BATCHES,
             COUNT(CASE WHEN b.STATUS = 'blocked' THEN 1 END)                                AS BLOCKED_BATCHES,
             NVL(SUM(CASE WHEN b.STATUS = 'blocked' THEN b.CURRENT_QTY_KG END), 0)           AS BLOCKED_KG,
             COUNT(CASE WHEN b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 AND b.EXPIRY_DATE < TRUNC(SYSDATE) THEN 1 END) AS EXPIRED_BATCHES,
             COUNT(CASE WHEN b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 AND b.EXPIRY_DATE >= TRUNC(SYSDATE)
                         AND b.EXPIRY_DATE < TRUNC(SYSDATE) + 8 THEN 1 END)                  AS EXPIRING_7D
      FROM AGRO_BATCHES b
      LEFT JOIN (SELECT a.BATCH_ID, SUM(a.ALLOCATED_QTY_KG) AS QTY
                   FROM AGRO_BATCH_ALLOCATIONS a
                   JOIN AGRO_SALES_LINES sl ON sl.ID = a.SALES_LINE_ID
                   JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
                  WHERE sd.STATUS IN ('draft','confirmed')
                  GROUP BY a.BATCH_ID) rsv ON rsv.BATCH_ID = b.ID
    `),
    query<Row>(`
      SELECT w.ID, w.NAME, w.CAPACITY_KG,
             NVL(SUM(CASE WHEN b.STATUS IN ('active','blocked') THEN b.CURRENT_QTY_KG END), 0) AS STOCK_KG,
             COUNT(CASE WHEN b.STATUS IN ('active','blocked') AND b.CURRENT_QTY_KG > 0 THEN 1 END) AS BATCHES
      FROM AGRO_WAREHOUSES w
      LEFT JOIN AGRO_BATCHES b ON b.WAREHOUSE_ID = w.ID
      WHERE w.ACTIVE = 'Y'
      GROUP BY w.ID, w.NAME, w.CAPACITY_KG
      ORDER BY STOCK_KG DESC, w.NAME
    `),
    query<Row>(`
      SELECT i.ID, i.NAME_RO, i.NAME_RU,
             SUM(b.CURRENT_QTY_KG) AS STOCK_KG, COUNT(*) AS BATCHES,
             ROUND(SUM(b.CURRENT_QTY_KG * (TRUNC(SYSDATE) - TRUNC(b.RECEIVED_AT))) / NULLIF(SUM(b.CURRENT_QTY_KG), 0)) AS AVG_AGE_DAYS
      FROM AGRO_BATCHES b
      JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
      WHERE b.STATUS IN ('active','blocked') AND b.CURRENT_QTY_KG > 0
      GROUP BY i.ID, i.NAME_RO, i.NAME_RU
      ORDER BY STOCK_KG DESC
    `),
  ]);
  const t = tot[0] ?? {};
  const stock = n(t.STOCK_KG), reserved = n(t.RESERVED_KG), blocked = n(t.BLOCKED_KG);
  return {
    stock_kg: stock, reserved_kg: reserved, blocked_kg: blocked,
    free_kg: Math.max(0, stock - reserved - blocked),
    active_batches: n(t.ACTIVE_BATCHES), blocked_batches: n(t.BLOCKED_BATCHES),
    expired_batches: n(t.EXPIRED_BATCHES), expiring_7d: n(t.EXPIRING_7D),
    warehouses: byWh.map(r => ({
      id: n(r.ID), name: s(r.NAME), capacity_kg: r.CAPACITY_KG != null ? n(r.CAPACITY_KG) : null,
      stock_kg: n(r.STOCK_KG), batches: n(r.BATCHES),
    })),
    items: byItem.map(r => ({
      id: n(r.ID), name: pickName(lang, r.NAME_RO, r.NAME_RU), stock_kg: n(r.STOCK_KG),
      batches: n(r.BATCHES), avg_age_days: r.AVG_AGE_DAYS != null ? n(r.AVG_AGE_DAYS) : null,
    })),
  };
}

// ── Batches ──────────────────────────────────────────────────────────────
export interface BatchFilters {
  warehouse_id: number | null; item_id: number | null; supplier_id: number | null;
  status: string | null; q: string | null; only_stock: boolean;
}

export function parseBatchFilters(sp: URLSearchParams): BatchFilters {
  const id = (k: string) => { const v = Number(sp.get(k)); return v > 0 ? v : null; };
  const st = sp.get("status") ?? "";
  return {
    warehouse_id: id("warehouse_id"), item_id: id("item_id"), supplier_id: id("supplier_id"),
    status: ["active", "blocked", "depleted"].includes(st) ? st : null,
    q: (sp.get("q") ?? "").trim().slice(0, 60) || null,
    only_stock: sp.get("only_stock") !== "0",
  };
}

export async function batches(f: BatchFilters, lang: Lang) {
  const where: string[] = [];
  const binds: Record<string, string | number> = {};
  if (f.warehouse_id) { where.push("b.WAREHOUSE_ID = :wh"); binds.wh = f.warehouse_id; }
  if (f.item_id)      { where.push("b.ITEM_ID = :item");    binds.item = f.item_id; }
  if (f.supplier_id)  { where.push("s.ID = :sup");          binds.sup = f.supplier_id; }
  if (f.status)       { where.push("b.STATUS = :st");       binds.st = f.status; }
  if (f.only_stock)   where.push("b.STATUS IN ('active','blocked') AND b.CURRENT_QTY_KG > 0");
  if (f.q) { where.push("(UPPER(b.BATCH_NUMBER) LIKE :q OR UPPER(s.NAME) LIKE :q OR UPPER(pd.DOC_NUMBER) LIKE :q)"); binds.q = `%${f.q.toUpperCase()}%`; }

  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT b.ID, b.BATCH_NUMBER, b.STATUS, b.INITIAL_QTY_KG, b.CURRENT_QTY_KG, b.RECEIVED_AT, b.EXPIRY_DATE,
             b.BLOCK_REASON, TRUNC(SYSDATE) - TRUNC(b.RECEIVED_AT) AS AGE_DAYS,
             i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
             v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU,
             w.NAME AS WAREHOUSE_NAME, NVL(c.CODE, c.NAME) AS CELL_CODE,
             s.NAME AS SUPPLIER_NAME, pd.DOC_NUMBER AS PURCHASE_DOC,
             NVL(rsv.QTY, 0) AS RESERVED_KG
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
                  WHERE sd.STATUS IN ('draft','confirmed')
                  GROUP BY a.BATCH_ID) rsv ON rsv.BATCH_ID = b.ID
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY b.RECEIVED_AT DESC, b.ID DESC
    ) WHERE ROWNUM <= 2000
  `, binds);
  return rows.map(r => ({
    id: n(r.ID), batch_number: s(r.BATCH_NUMBER), status: s(r.STATUS),
    item_name: pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU),
    variety_name: pickName(lang, r.VARIETY_NAME_RO, r.VARIETY_NAME_RU),
    warehouse_name: s(r.WAREHOUSE_NAME), cell_code: s(r.CELL_CODE),
    supplier_name: s(r.SUPPLIER_NAME), purchase_doc: s(r.PURCHASE_DOC),
    initial_kg: n(r.INITIAL_QTY_KG), current_kg: n(r.CURRENT_QTY_KG), reserved_kg: n(r.RESERVED_KG),
    received_at: iso(r.RECEIVED_AT), expiry_date: iso(r.EXPIRY_DATE),
    age_days: r.AGE_DAYS != null ? n(r.AGE_DAYS) : null, block_reason: s(r.BLOCK_REASON),
  }));
}

// ── One batch: origin, where it went, full history ───────────────────────
export async function batchDetail(id: number, lang: Lang) {
  const [hdr, sales, history] = await Promise.all([
    query<Row>(`
      SELECT b.ID, b.BATCH_NUMBER, b.STATUS, b.INITIAL_QTY_KG, b.CURRENT_QTY_KG, b.RECEIVED_AT, b.EXPIRY_DATE,
             b.BLOCKED_BY, b.BLOCK_REASON, b.NOTES, b.SOURCE_TYPE,
             i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
             v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU,
             w.NAME AS WAREHOUSE_NAME, NVL(c.CODE, c.NAME) AS CELL_CODE,
             pd.ID AS PURCHASE_ID, pd.DOC_NUMBER AS PURCHASE_DOC, pd.DOC_DATE AS PURCHASE_DATE,
             s.ID AS SUPPLIER_ID, s.NAME AS SUPPLIER_NAME, pl.CRATES_COUNT, pl.PALLETS
      FROM AGRO_BATCHES b
      LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
      LEFT JOIN AGRO_STORAGE_CELLS c ON c.ID = b.CELL_ID
      LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
      LEFT JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
      LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
      LEFT JOIN AGRO_ITEM_VARIETIES v ON v.ID = NVL(pl.VARIETY_ID, b.VARIETY_ID)
      WHERE b.ID = :1
    `, [id]),
    query<Row>(`
      SELECT sd.ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, sd.STATUS, c.NAME AS CUSTOMER_NAME,
             SUM(a.ALLOCATED_QTY_KG) AS QTY_KG
      FROM AGRO_BATCH_ALLOCATIONS a
      JOIN AGRO_SALES_LINES sl ON sl.ID = a.SALES_LINE_ID
      JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      WHERE a.BATCH_ID = :1
      GROUP BY sd.ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, sd.STATUS, c.NAME
      ORDER BY sd.DOC_DATE
    `, [id]),
    // Same timeline as DIPP FRUICT get_batch_history, plus warehouse names / author.
    query<Row>(`
      SELECT * FROM (
        SELECT 'movement' AS EVENT_TYPE, m.MOVEMENT_TYPE AS DETAIL, m.QTY_KG, m.REASON AS DESCRIPTION,
               m.CREATED_AT AS EVENT_TIME, m.CREATED_BY AS ACTOR, fw.NAME AS FROM_WH, tw.NAME AS TO_WH, m.DOC_REF
          FROM AGRO_STOCK_MOVEMENTS m
          LEFT JOIN AGRO_WAREHOUSES fw ON fw.ID = m.FROM_WAREHOUSE_ID
          LEFT JOIN AGRO_WAREHOUSES tw ON tw.ID = m.TO_WAREHOUSE_ID
         WHERE m.BATCH_ID = :1
        UNION ALL
        SELECT 'qa_check', RESULT, NULL, NOTES, CREATED_AT, INSPECTOR, NULL, NULL, NULL
          FROM AGRO_QA_CHECKS WHERE BATCH_ID = :1
        UNION ALL
        SELECT 'block', 'blocked', NULL, REASON, CAST(BLOCKED_AT AS DATE), BLOCKED_BY, NULL, NULL, NULL
          FROM AGRO_BATCH_BLOCKS WHERE BATCH_ID = :1
        UNION ALL
        SELECT 'unblock', 'unblocked', NULL, RESOLUTION_NOTES, CAST(UNBLOCKED_AT AS DATE), UNBLOCKED_BY, NULL, NULL, NULL
          FROM AGRO_BATCH_BLOCKS WHERE BATCH_ID = :1 AND UNBLOCKED_AT IS NOT NULL
      ) ORDER BY EVENT_TIME DESC
    `, [id]),
  ]);
  if (!hdr.length) return null;
  const h = hdr[0];
  return {
    id: n(h.ID), batch_number: s(h.BATCH_NUMBER), status: s(h.STATUS), source_type: s(h.SOURCE_TYPE),
    item_name: pickName(lang, h.ITEM_NAME_RO, h.ITEM_NAME_RU),
    variety_name: pickName(lang, h.VARIETY_NAME_RO, h.VARIETY_NAME_RU),
    warehouse_name: s(h.WAREHOUSE_NAME), cell_code: s(h.CELL_CODE),
    initial_kg: n(h.INITIAL_QTY_KG), current_kg: n(h.CURRENT_QTY_KG),
    received_at: iso(h.RECEIVED_AT), expiry_date: iso(h.EXPIRY_DATE),
    blocked_by: s(h.BLOCKED_BY), block_reason: s(h.BLOCK_REASON), notes: s(h.NOTES),
    purchase: h.PURCHASE_ID ? { id: n(h.PURCHASE_ID), doc_number: s(h.PURCHASE_DOC), doc_date: iso(h.PURCHASE_DATE) } : null,
    supplier: h.SUPPLIER_ID ? { id: n(h.SUPPLIER_ID), name: s(h.SUPPLIER_NAME) } : null,
    crates: h.CRATES_COUNT != null ? n(h.CRATES_COUNT) : null, pallets: h.PALLETS != null ? n(h.PALLETS) : null,
    sales: sales.map(r => ({
      id: n(r.ID), doc_number: s(r.INVOICE_NUMBER) || s(r.DOC_NUMBER), doc_date: iso(r.DOC_DATE),
      status: s(r.STATUS), customer_name: s(r.CUSTOMER_NAME), qty_kg: n(r.QTY_KG),
    })),
    history: history.map(r => ({
      event_type: s(r.EVENT_TYPE), detail: s(r.DETAIL), qty_kg: r.QTY_KG != null ? n(r.QTY_KG) : null,
      description: s(r.DESCRIPTION), event_time: iso(r.EVENT_TIME), actor: s(r.ACTOR),
      from_wh: s(r.FROM_WH), to_wh: s(r.TO_WH), doc_ref: s(r.DOC_REF),
    })),
  };
}

// ── Movements journal ────────────────────────────────────────────────────
export const MOVEMENT_TYPES = ["receipt", "shipment", "transfer", "adjustment", "return", "loss", "processing"];

export interface MovementFilters {
  date_from: string | null; date_to: string | null; type: string | null;
  warehouse_id: number | null; item_id: number | null; q: string | null;
}

export function parseMovementFilters(sp: URLSearchParams): MovementFilters {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const id = (k: string) => { const v = Number(sp.get(k)); return v > 0 ? v : null; };
  const type = sp.get("type") ?? "";
  return {
    date_from: d("date_from"), date_to: d("date_to"),
    type: MOVEMENT_TYPES.includes(type) ? type : null,
    warehouse_id: id("warehouse_id"), item_id: id("item_id"),
    q: (sp.get("q") ?? "").trim().slice(0, 60) || null,
  };
}

export function movementWhere(f: MovementFilters) {
  const where: string[] = [];
  const binds: Record<string, string | number> = {};
  if (f.date_from) { where.push("m.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD')"); binds.dfrom = f.date_from; }
  if (f.date_to)   { where.push("m.CREATED_AT < TO_DATE(:dto, 'YYYY-MM-DD') + 1"); binds.dto = f.date_to; }
  if (f.type)      { where.push("m.MOVEMENT_TYPE = :type"); binds.type = f.type; }
  if (f.warehouse_id) { where.push("(m.FROM_WAREHOUSE_ID = :wh OR m.TO_WAREHOUSE_ID = :wh)"); binds.wh = f.warehouse_id; }
  if (f.item_id)   { where.push("b.ITEM_ID = :item"); binds.item = f.item_id; }
  if (f.q) { where.push("(UPPER(b.BATCH_NUMBER) LIKE :q OR UPPER(m.DOC_REF) LIKE :q OR UPPER(m.REASON) LIKE :q)"); binds.q = `%${f.q.toUpperCase()}%`; }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", binds };
}

export const MOVEMENTS_SQL = (whereSql: string) => `
  SELECT m.ID, m.CREATED_AT, m.MOVEMENT_TYPE, m.QTY_KG, m.REASON, m.DOC_REF, m.CREATED_BY,
         b.ID AS BATCH_ID, b.BATCH_NUMBER, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
         fw.NAME AS FROM_WAREHOUSE, tw.NAME AS TO_WAREHOUSE
  FROM AGRO_STOCK_MOVEMENTS m
  JOIN AGRO_BATCHES b ON b.ID = m.BATCH_ID
  LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
  LEFT JOIN AGRO_WAREHOUSES fw ON fw.ID = m.FROM_WAREHOUSE_ID
  LEFT JOIN AGRO_WAREHOUSES tw ON tw.ID = m.TO_WAREHOUSE_ID
  ${whereSql}
  ORDER BY m.CREATED_AT DESC, m.ID DESC`;

export async function movements(f: MovementFilters, lang: Lang) {
  const w = movementWhere(f);
  const [rows, sums] = await Promise.all([
    query<Row>(`SELECT * FROM (${MOVEMENTS_SQL(w.sql)}) WHERE ROWNUM <= 1000`, w.binds),
    query<Row>(`
      SELECT m.MOVEMENT_TYPE, COUNT(*) AS CNT, SUM(m.QTY_KG) AS KG
      FROM AGRO_STOCK_MOVEMENTS m JOIN AGRO_BATCHES b ON b.ID = m.BATCH_ID
      ${w.sql} GROUP BY m.MOVEMENT_TYPE
    `, w.binds),
  ]);
  return {
    rows: rows.map(r => ({
      id: n(r.ID), created_at: iso(r.CREATED_AT), type: s(r.MOVEMENT_TYPE), qty_kg: n(r.QTY_KG),
      batch_id: n(r.BATCH_ID), batch_number: s(r.BATCH_NUMBER), item_name: pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU),
      from_warehouse: s(r.FROM_WAREHOUSE), to_warehouse: s(r.TO_WAREHOUSE),
      reason: s(r.REASON), doc_ref: s(r.DOC_REF), created_by: s(r.CREATED_BY),
    })),
    by_type: sums.map(r => ({ type: s(r.MOVEMENT_TYPE), count: n(r.CNT), kg: n(r.KG) })),
    total: sums.reduce((a, r) => a + n(r.CNT), 0),
  };
}

// ── Cells & cold rooms ───────────────────────────────────────────────────
export async function cells() {
  const [cellRows, alertRows] = await Promise.all([
    query<Row>(`
      SELECT c.ID, c.CODE, c.NAME, c.CELL_TYPE, c.CAPACITY_KG, c.TEMP_MIN, c.TEMP_MAX,
             c.HUMIDITY_MIN, c.HUMIDITY_MAX, c.ACTIVE, w.NAME AS WAREHOUSE_NAME,
             (SELECT NVL(SUM(b.CURRENT_QTY_KG), 0) FROM AGRO_BATCHES b
               WHERE b.CELL_ID = c.ID AND b.STATUS IN ('active','blocked')) AS STOCK_KG,
             (SELECT COUNT(*) FROM AGRO_BATCHES b
               WHERE b.CELL_ID = c.ID AND b.STATUS IN ('active','blocked') AND b.CURRENT_QTY_KG > 0) AS BATCHES,
             (SELECT COUNT(*) FROM AGRO_STORAGE_ALERTS a WHERE a.CELL_ID = c.ID AND NVL(a.ACKNOWLEDGED, 'N') <> 'Y') AS OPEN_ALERTS,
             lr.TEMPERATURE_C, lr.HUMIDITY_PCT, lr.RECORDED_AT AS LAST_READING_AT
      FROM AGRO_STORAGE_CELLS c
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = c.WAREHOUSE_ID
      LEFT JOIN (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.CELL_ID ORDER BY r.RECORDED_AT DESC) AS RN
                   FROM AGRO_STORAGE_READINGS r) lr ON lr.CELL_ID = c.ID AND lr.RN = 1
      ORDER BY w.NAME, c.CODE
    `),
    query<Row>(`
      SELECT * FROM (
        SELECT a.ID, a.CELL_ID, a.ALERT_TYPE, a.THRESHOLD_VALUE, a.ACTUAL_VALUE, a.ACKNOWLEDGED,
               a.ACKNOWLEDGED_BY, a.ACKNOWLEDGED_AT, a.CREATED_AT, c.CODE AS CELL_CODE, w.NAME AS WAREHOUSE_NAME
        FROM AGRO_STORAGE_ALERTS a
        LEFT JOIN AGRO_STORAGE_CELLS c ON c.ID = a.CELL_ID
        LEFT JOIN AGRO_WAREHOUSES w ON w.ID = c.WAREHOUSE_ID
        ORDER BY CASE WHEN NVL(a.ACKNOWLEDGED, 'N') = 'Y' THEN 1 ELSE 0 END, a.CREATED_AT DESC
      ) WHERE ROWNUM <= 200
    `),
  ]);
  return {
    cells: cellRows.map(r => ({
      id: n(r.ID), code: s(r.CODE), name: s(r.NAME), cell_type: s(r.CELL_TYPE), warehouse_name: s(r.WAREHOUSE_NAME),
      active: r.ACTIVE !== "N", capacity_kg: r.CAPACITY_KG != null ? n(r.CAPACITY_KG) : null,
      temp_min: r.TEMP_MIN != null ? n(r.TEMP_MIN) : null, temp_max: r.TEMP_MAX != null ? n(r.TEMP_MAX) : null,
      humidity_min: r.HUMIDITY_MIN != null ? n(r.HUMIDITY_MIN) : null, humidity_max: r.HUMIDITY_MAX != null ? n(r.HUMIDITY_MAX) : null,
      stock_kg: n(r.STOCK_KG), batches: n(r.BATCHES), open_alerts: n(r.OPEN_ALERTS),
      last_temp: r.TEMPERATURE_C != null ? n(r.TEMPERATURE_C) : null,
      last_humidity: r.HUMIDITY_PCT != null ? n(r.HUMIDITY_PCT) : null,
      last_reading_at: iso(r.LAST_READING_AT),
    })),
    alerts: alertRows.map(r => ({
      id: n(r.ID), cell_code: s(r.CELL_CODE), warehouse_name: s(r.WAREHOUSE_NAME), alert_type: s(r.ALERT_TYPE),
      threshold: r.THRESHOLD_VALUE != null ? n(r.THRESHOLD_VALUE) : null, actual: r.ACTUAL_VALUE != null ? n(r.ACTUAL_VALUE) : null,
      acknowledged: r.ACKNOWLEDGED === "Y", acknowledged_by: s(r.ACKNOWLEDGED_BY),
      acknowledged_at: iso(r.ACKNOWLEDGED_AT), created_at: iso(r.CREATED_AT),
    })),
  };
}

// ── Rotation (stock age) ─────────────────────────────────────────────────
export const AGE_BUCKETS = [
  { key: "0_30", min: 0, max: 30 }, { key: "31_60", min: 31, max: 60 },
  { key: "61_90", min: 61, max: 90 }, { key: "90_plus", min: 91, max: Infinity },
] as const;

export async function rotation(lang: Lang) {
  const rows = await query<Row>(`
    SELECT i.ID AS ITEM_ID, i.NAME_RO, i.NAME_RU,
           TRUNC(SYSDATE) - TRUNC(b.RECEIVED_AT) AS AGE_DAYS, b.CURRENT_QTY_KG
    FROM AGRO_BATCHES b
    JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
    WHERE b.STATUS IN ('active','blocked') AND b.CURRENT_QTY_KG > 0 AND b.RECEIVED_AT IS NOT NULL
  `);
  const bucketOf = (age: number) => AGE_BUCKETS.find(b => age >= b.min && age <= b.max)!.key;
  const buckets: Record<string, { kg: number; batches: number }> = Object.fromEntries(AGE_BUCKETS.map(b => [b.key, { kg: 0, batches: 0 }]));
  const items = new Map<number, { name: string; total_kg: number; max_age: number; kg_by_bucket: Record<string, number> }>();
  for (const r of rows) {
    const age = Math.max(0, n(r.AGE_DAYS)), kg = n(r.CURRENT_QTY_KG), key = bucketOf(age);
    buckets[key].kg += kg; buckets[key].batches += 1;
    const id = n(r.ITEM_ID);
    const it = items.get(id) ?? { name: pickName(lang, r.NAME_RO, r.NAME_RU), total_kg: 0, max_age: 0, kg_by_bucket: Object.fromEntries(AGE_BUCKETS.map(b => [b.key, 0])) };
    it.total_kg += kg; it.max_age = Math.max(it.max_age, age); it.kg_by_bucket[key] += kg;
    items.set(id, it);
  }
  return {
    buckets: AGE_BUCKETS.map(b => ({ key: b.key, ...buckets[b.key] })),
    items: [...items.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.max_age - a.max_age || b.total_kg - a.total_kg),
  };
}

// ── Control: automatic data checks ───────────────────────────────────────
// Each check returns the offending batches. "Stock ≠ movements" is the one
// that found the 9 t gap: kg changed in DIPP FRUICT without a movement row.
export async function controlChecks(lang: Lang) {
  const base = `
    SELECT b.ID, b.BATCH_NUMBER, b.STATUS, b.INITIAL_QTY_KG, b.CURRENT_QTY_KG, b.EXPIRY_DATE,
           i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU, w.NAME AS WAREHOUSE_NAME, x.EXPECTED_KG
    FROM AGRO_BATCHES b
    LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
    LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
    LEFT JOIN (SELECT BATCH_ID,
                      SUM(CASE WHEN MOVEMENT_TYPE IN ('receipt','return','adjustment') THEN QTY_KG
                               WHEN MOVEMENT_TYPE IN ('shipment','loss','processing') THEN -QTY_KG ELSE 0 END) AS EXPECTED_KG
                 FROM AGRO_STOCK_MOVEMENTS GROUP BY BATCH_ID) x ON x.BATCH_ID = b.ID`;
  const [mismatch, negative, expired, zeroActive, depletedWithStock] = await Promise.all([
    query<Row>(`${base} WHERE x.BATCH_ID IS NOT NULL AND ABS(NVL(b.CURRENT_QTY_KG, 0) - x.EXPECTED_KG) > 0.5 ORDER BY b.ID`),
    query<Row>(`${base} WHERE b.CURRENT_QTY_KG < 0 ORDER BY b.ID`),
    query<Row>(`${base} WHERE b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 AND b.EXPIRY_DATE < TRUNC(SYSDATE) ORDER BY b.EXPIRY_DATE`),
    query<Row>(`${base} WHERE b.STATUS = 'active' AND NVL(b.CURRENT_QTY_KG, 0) <= 0 ORDER BY b.ID`),
    query<Row>(`${base} WHERE b.STATUS = 'depleted' AND b.CURRENT_QTY_KG > 0.5 ORDER BY b.ID`),
  ]);
  const map = (rows: Row[]) => rows.map(r => ({
    id: n(r.ID), batch_number: s(r.BATCH_NUMBER), status: s(r.STATUS),
    item_name: pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU), warehouse_name: s(r.WAREHOUSE_NAME),
    initial_kg: n(r.INITIAL_QTY_KG), current_kg: n(r.CURRENT_QTY_KG),
    expected_kg: r.EXPECTED_KG != null ? n(r.EXPECTED_KG) : null, expiry_date: iso(r.EXPIRY_DATE),
  }));
  return [
    { key: "mismatch",          severity: "serious", rows: map(mismatch) },
    { key: "negative",          severity: "critical", rows: map(negative) },
    { key: "expired",           severity: "warning", rows: map(expired) },
    { key: "zero_active",       severity: "warning", rows: map(zeroActive) },
    { key: "depleted_with_stock", severity: "serious", rows: map(depletedWithStock) },
  ];
}

// ── Safe actions ─────────────────────────────────────────────────────────
async function inTransaction(fn: (exec: (sql: string, binds: Record<string, unknown>) => Promise<number>) => Promise<void>) {
  const conn = await getConnection();
  try {
    await fn(async (sql, binds) => (await conn.execute(sql, binds as never)).rowsAffected ?? 0);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.close();
  }
}

export class ActionError extends Error {}

export async function blockBatch(id: number, reason: string, user: string) {
  const rows = await query<Row>(`SELECT BATCH_NUMBER, STATUS, CURRENT_QTY_KG FROM AGRO_BATCHES WHERE ID = :1`, [id]);
  if (!rows.length) throw new ActionError("Партия не найдена");
  if (rows[0].STATUS === "blocked")  throw new ActionError("Партия уже заблокирована");
  if (rows[0].STATUS === "depleted") throw new ActionError("Партия исчерпана — блокировать нечего");
  await inTransaction(async exec => {
    await exec(`INSERT INTO AGRO_BATCH_BLOCKS (BATCH_ID, REASON, BLOCKED_BY) VALUES (:bid, :reason, :usr)`, { bid: id, reason, usr: user });
    await exec(`UPDATE AGRO_BATCHES SET STATUS = 'blocked', BLOCKED_BY = :usr, BLOCK_REASON = :reason WHERE ID = :bid`, { bid: id, reason, usr: user });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
                VALUES ('batch', :bid, :name, 'block', :usr, :old, :new)`,
      { bid: id, name: s(rows[0].BATCH_NUMBER), usr: user, old: JSON.stringify({ status: rows[0].STATUS }), new: JSON.stringify({ status: "blocked", reason }) });
  });
}

export async function unblockBatch(id: number, resolution: string, user: string) {
  const rows = await query<Row>(`SELECT BATCH_NUMBER, STATUS, CURRENT_QTY_KG FROM AGRO_BATCHES WHERE ID = :1`, [id]);
  if (!rows.length) throw new ActionError("Партия не найдена");
  if (rows[0].STATUS !== "blocked") throw new ActionError("Партия не заблокирована");
  // DIPP FRUICT always restores 'active'; a batch that is empty by now goes to
  // 'depleted' instead so it doesn't show up as live stock with 0 kg.
  const next = n(rows[0].CURRENT_QTY_KG) > 0 ? "active" : "depleted";
  await inTransaction(async exec => {
    await exec(`UPDATE AGRO_BATCH_BLOCKS SET UNBLOCKED_BY = :usr, UNBLOCKED_AT = SYSTIMESTAMP, RESOLUTION_NOTES = :notes
                 WHERE BATCH_ID = :bid AND UNBLOCKED_AT IS NULL`, { bid: id, usr: user, notes: resolution });
    await exec(`UPDATE AGRO_BATCHES SET STATUS = :st, BLOCKED_BY = NULL, BLOCK_REASON = NULL WHERE ID = :bid`, { bid: id, st: next });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
                VALUES ('batch', :bid, :name, 'unblock', :usr, :old, :new)`,
      { bid: id, name: s(rows[0].BATCH_NUMBER), usr: user, old: JSON.stringify({ status: "blocked" }), new: JSON.stringify({ status: next, resolution }) });
  });
  return next;
}

export async function acknowledgeAlert(id: number, user: string) {
  let affected = 0;
  await inTransaction(async exec => {
    affected = await exec(`UPDATE AGRO_STORAGE_ALERTS SET ACKNOWLEDGED = 'Y', ACKNOWLEDGED_BY = :usr, ACKNOWLEDGED_AT = SYSTIMESTAMP
                            WHERE ID = :aid AND NVL(ACKNOWLEDGED, 'N') <> 'Y'`, { aid: id, usr: user });
  });
  if (!affected) throw new ActionError("Алерт не найден или уже подтверждён");
}

// ── Filter option lists ──────────────────────────────────────────────────
export async function options(lang: Lang) {
  const [wh, items, sup] = await Promise.all([
    query<Row>(`SELECT ID, NAME FROM AGRO_WAREHOUSES WHERE ACTIVE = 'Y' ORDER BY NAME`),
    query<Row>(`SELECT ID, NAME_RO, NAME_RU FROM AGRO_ITEMS WHERE ACTIVE = 'Y' ORDER BY NAME_RO`),
    query<Row>(`SELECT ID, NAME FROM AGRO_SUPPLIERS WHERE ACTIVE = 'Y' ORDER BY NAME`),
  ]);
  return {
    warehouses: wh.map(r => ({ id: n(r.ID), name: s(r.NAME) })),
    items: items.map(r => ({ id: n(r.ID), name: pickName(lang, r.NAME_RO, r.NAME_RU) })),
    suppliers: sup.map(r => ({ id: n(r.ID), name: s(r.NAME) })),
  };
}
