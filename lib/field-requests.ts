// Field requests (DIPP FRUICT Recepție → «Cereri», AGRO_FIELD_REQUESTS /
// _LINES): what is expected from a supplier and at what price limit.
// Created and approved in DIPP FRUICT — read-only here.
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const FR_STATUSES = ["draft", "approved", "in_progress", "fulfilled", "cancelled"] as const;

export async function listFieldRequests(sp: URLSearchParams, lang: Lang) {
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "", st = sp.get("status") ?? "";
  if (ISO.test(df)) { w.push("r.REQUEST_DATE >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("r.REQUEST_DATE < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  if ((FR_STATUSES as readonly string[]).includes(st)) { w.push("r.STATUS = :st"); b.st = st; }
  const sup = Number(sp.get("supplier_id"));
  if (sup > 0) { w.push("r.SUPPLIER_ID = :sup"); b.sup = sup; }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) { w.push("(UPPER(r.REQUEST_NUMBER) LIKE :q OR UPPER(s.NAME) LIKE :q OR UPPER(r.NOTES) LIKE :q)"); b.q = `%${q.toUpperCase()}%`; }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT r.ID, r.REQUEST_NUMBER, r.REQUEST_DATE, r.EXPECTED_DATE, r.STATUS, r.NOTES, r.CREATED_BY, r.APPROVED_BY, r.APPROVED_AT,
             s.ID AS SUPPLIER_ID, s.NAME AS SUPPLIER_NAME, w.NAME AS WAREHOUSE_NAME, p.NAME_RO AS PROFILE_RO, p.NAME_RU AS PROFILE_RU,
             (SELECT NVL(SUM(l.EXPECTED_QTY_KG), 0) FROM AGRO_FIELD_REQUEST_LINES l WHERE l.REQUEST_ID = r.ID) AS EXPECTED_KG,
             (SELECT NVL(SUM(l.ACTUAL_QTY_KG), 0) FROM AGRO_FIELD_REQUEST_LINES l WHERE l.REQUEST_ID = r.ID) AS ACTUAL_KG,
             (SELECT COUNT(*) FROM AGRO_FIELD_REQUEST_LINES l WHERE l.REQUEST_ID = r.ID) AS LINES
      FROM AGRO_FIELD_REQUESTS r
      LEFT JOIN AGRO_SUPPLIERS s ON s.ID = r.SUPPLIER_ID
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = r.WAREHOUSE_ID
      LEFT JOIN AGRO_ACCEPTANCE_PROFILES p ON p.ID = r.PROFILE_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY r.REQUEST_DATE DESC, r.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  const list = rows.map(r => ({
    id: n(r.ID), number: s(r.REQUEST_NUMBER), date: iso(r.REQUEST_DATE), expected_date: iso(r.EXPECTED_DATE), status: s(r.STATUS),
    notes: s(r.NOTES), created_by: s(r.CREATED_BY), approved_by: s(r.APPROVED_BY), approved_at: iso(r.APPROVED_AT),
    supplier_id: nn(r.SUPPLIER_ID), supplier_name: s(r.SUPPLIER_NAME), warehouse: s(r.WAREHOUSE_NAME),
    profile: pickName(lang, r.PROFILE_RO, r.PROFILE_RU), expected_kg: n(r.EXPECTED_KG), actual_kg: n(r.ACTUAL_KG), lines: n(r.LINES),
  }));
  const cnt = (k: string) => list.filter(r => r.status === k).length;
  return {
    rows: list,
    totals: {
      count: list.length, open: cnt("draft") + cnt("approved") + cnt("in_progress"), fulfilled: cnt("fulfilled"),
      expected_kg: list.filter(r => r.status !== "cancelled").reduce((a, r) => a + r.expected_kg, 0),
      actual_kg: list.filter(r => r.status !== "cancelled").reduce((a, r) => a + r.actual_kg, 0),
    },
  };
}

export async function fieldRequestLines(id: number, lang: Lang) {
  const rows = await query<Row>(`
    SELECT l.ID, l.EXPECTED_QTY_KG, l.ACTUAL_QTY_KG, l.PRICE_LIMIT_PER_KG, l.NOTES,
           i.NAME_RO, i.NAME_RU, v.NAME_RO AS VAR_RO, v.NAME_RU AS VAR_RU
    FROM AGRO_FIELD_REQUEST_LINES l
    LEFT JOIN AGRO_ITEMS i ON i.ID = l.ITEM_ID
    LEFT JOIN AGRO_ITEM_VARIETIES v ON v.ID = l.VARIETY_ID
    WHERE l.REQUEST_ID = :1 ORDER BY l.ID`, [id]);
  return rows.map(r => ({
    id: n(r.ID), item: pickName(lang, r.NAME_RO, r.NAME_RU), variety: pickName(lang, r.VAR_RO, r.VAR_RU),
    expected_kg: nn(r.EXPECTED_QTY_KG), actual_kg: nn(r.ACTUAL_QTY_KG), price_limit: nn(r.PRICE_LIMIT_PER_KG), notes: s(r.NOTES),
  }));
}
