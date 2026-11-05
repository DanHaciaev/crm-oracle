// Quality: a read-only view of what DIPP FRUICT records — QA checks, HACCP
// measurements and blocked batches. Checks and measurements are made in
// DIPP FRUICT (a failed check auto-blocks the batch there); the CRM only
// lists, inspects and prints them.
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ── QA checks (DIPP FRUICT, read-only) ───────────────────────────────────

export async function listChecks(sp: URLSearchParams, lang: Lang) {
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "", res = sp.get("result") ?? "";
  if (ISO.test(df)) { w.push("qc.CHECK_DATE >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("qc.CHECK_DATE < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  if (["pass", "conditional", "fail"].includes(res)) { w.push("qc.RESULT = :res"); b.res = res; }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) { w.push("(UPPER(b.BATCH_NUMBER) LIKE :q OR UPPER(qc.INSPECTOR) LIKE :q OR UPPER(qc.NOTES) LIKE :q)"); b.q = `%${q.toUpperCase()}%`; }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT qc.ID, qc.CHECK_DATE, qc.RESULT, qc.INSPECTOR, qc.NOTES, qc.CREATED_AT,
             cl.NAME_RO AS CL_RO, cl.NAME_RU AS CL_RU, cl.CHECKLIST_TYPE,
             b.ID AS BATCH_ID, b.BATCH_NUMBER, i.NAME_RO, i.NAME_RU,
             (SELECT COUNT(*) FROM AGRO_QA_CHECK_VALUES v WHERE v.CHECK_ID = qc.ID AND v.IS_COMPLIANT = 'N') AS FAILS
      FROM AGRO_QA_CHECKS qc
      LEFT JOIN AGRO_QA_CHECKLISTS cl ON cl.ID = qc.CHECKLIST_ID
      LEFT JOIN AGRO_BATCHES b ON b.ID = qc.BATCH_ID
      LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY qc.CHECK_DATE DESC, qc.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  const list = rows.map(r => ({
    id: n(r.ID), date: iso(r.CHECK_DATE), result: s(r.RESULT), inspector: s(r.INSPECTOR), notes: s(r.NOTES),
    checklist: pickName(lang, r.CL_RO, r.CL_RU), checklist_type: s(r.CHECKLIST_TYPE),
    batch_id: nn(r.BATCH_ID), batch_number: s(r.BATCH_NUMBER), item: pickName(lang, r.NAME_RO, r.NAME_RU), fails: n(r.FAILS),
  }));
  const count = (k: string) => list.filter(c => c.result === k).length;
  return { rows: list, totals: { count: list.length, pass: count("pass"), conditional: count("conditional"), fail: count("fail") } };
}

export async function checkDetail(id: number, lang: Lang) {
  const [hdr, vals] = await Promise.all([
    query<Row>(`
      SELECT qc.ID, qc.CHECK_DATE, qc.RESULT, qc.INSPECTOR, qc.NOTES, cl.CHECKLIST_TYPE,
             cl.NAME_RO AS CL_RO, cl.NAME_RU AS CL_RU, b.ID AS BATCH_ID, b.BATCH_NUMBER, b.STATUS AS BATCH_STATUS,
             i.NAME_RO, i.NAME_RU
      FROM AGRO_QA_CHECKS qc
      LEFT JOIN AGRO_QA_CHECKLISTS cl ON cl.ID = qc.CHECKLIST_ID
      LEFT JOIN AGRO_BATCHES b ON b.ID = qc.BATCH_ID
      LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
      WHERE qc.ID = :1`, [id]),
    query<Row>(`
      SELECT v.ID, v.VALUE, v.IS_COMPLIANT, ci.PARAMETER_NAME_RO, ci.PARAMETER_NAME_RU, ci.MIN_VALUE, ci.MAX_VALUE, ci.IS_CRITICAL
      FROM AGRO_QA_CHECK_VALUES v
      LEFT JOIN AGRO_QA_CHECKLIST_ITEMS ci ON ci.ID = v.CHECKLIST_ITEM_ID
      WHERE v.CHECK_ID = :1 ORDER BY ci.ITEM_ORDER, v.ID`, [id]),
  ]);
  if (!hdr.length) return null;
  const h = hdr[0];
  return {
    id: n(h.ID), date: iso(h.CHECK_DATE), result: s(h.RESULT), inspector: s(h.INSPECTOR), notes: s(h.NOTES),
    checklist: pickName(lang, h.CL_RO, h.CL_RU), checklist_type: s(h.CHECKLIST_TYPE),
    batch_id: nn(h.BATCH_ID), batch_number: s(h.BATCH_NUMBER), batch_status: s(h.BATCH_STATUS), item: pickName(lang, h.NAME_RO, h.NAME_RU),
    values: vals.map(v => ({
      id: n(v.ID), name: pickName(lang, v.PARAMETER_NAME_RO, v.PARAMETER_NAME_RU), value: s(v.VALUE),
      ok: s(v.IS_COMPLIANT) !== "N", critical: s(v.IS_CRITICAL) === "Y", min: nn(v.MIN_VALUE), max: nn(v.MAX_VALUE),
    })),
  };
}

// ── HACCP (DIPP FRUICT, read-only) ───────────────────────────────────────

export async function haccp(sp: URLSearchParams, lang: Lang) {
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "";
  const w: string[] = [];
  const b: Record<string, string> = {};
  if (ISO.test(df)) { w.push("r.RECORDED_AT >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("r.RECORDED_AT < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  if (sp.get("deviations") === "1") w.push("r.IS_WITHIN_LIMITS = 'N'");
  const [plans, ccps, recs] = await Promise.all([
    query<Row>(`SELECT ID, CODE, NAME_RO, NAME_RU, PROCESS_STAGE, ACTIVE FROM AGRO_HACCP_PLANS ORDER BY CODE`, []),
    query<Row>(`SELECT ID, PLAN_ID, CCP_NUMBER, HAZARD_TYPE, HAZARD_DESCRIPTION, CRITICAL_LIMIT_MIN, CRITICAL_LIMIT_MAX,
                       MONITORING_FREQUENCY, CORRECTIVE_ACTION FROM AGRO_HACCP_CCPS ORDER BY PLAN_ID, CCP_NUMBER`, []),
    query<Row>(`
      SELECT * FROM (
        SELECT r.ID, r.CCP_ID, r.MEASURED_VALUE, r.IS_WITHIN_LIMITS, r.DEVIATION_NOTES, r.CORRECTIVE_ACTION_TAKEN,
               r.RECORDED_BY, r.RECORDED_AT, c.CCP_NUMBER, c.HAZARD_DESCRIPTION, c.CRITICAL_LIMIT_MIN, c.CRITICAL_LIMIT_MAX,
               b.ID AS BATCH_ID, b.BATCH_NUMBER
        FROM AGRO_HACCP_RECORDS r
        LEFT JOIN AGRO_HACCP_CCPS c ON c.ID = r.CCP_ID
        LEFT JOIN AGRO_BATCHES b ON b.ID = r.BATCH_ID
        ${w.length ? "WHERE " + w.join(" AND ") : ""}
        ORDER BY r.RECORDED_AT DESC, r.ID DESC
      ) WHERE ROWNUM <= 2000`, b),
  ]);
  const records = recs.map(r => ({
    id: n(r.ID), ccp_id: n(r.CCP_ID), ccp_number: s(r.CCP_NUMBER), hazard: s(r.HAZARD_DESCRIPTION),
    value: nn(r.MEASURED_VALUE), min: nn(r.CRITICAL_LIMIT_MIN), max: nn(r.CRITICAL_LIMIT_MAX),
    ok: s(r.IS_WITHIN_LIMITS) !== "N", deviation: s(r.DEVIATION_NOTES), action: s(r.CORRECTIVE_ACTION_TAKEN),
    by: s(r.RECORDED_BY), at: iso(r.RECORDED_AT), batch_id: nn(r.BATCH_ID), batch_number: s(r.BATCH_NUMBER),
  }));
  const last = new Map<number, (typeof records)[number]>();
  for (const r of records) if (!last.has(r.ccp_id)) last.set(r.ccp_id, r);
  return {
    plans: plans.map(p => ({
      id: n(p.ID), code: s(p.CODE), name: pickName(lang, p.NAME_RO, p.NAME_RU), stage: s(p.PROCESS_STAGE), active: s(p.ACTIVE) !== "N",
      ccps: ccps.filter(c => n(c.PLAN_ID) === n(p.ID)).map(c => ({
        id: n(c.ID), number: s(c.CCP_NUMBER), hazard_type: s(c.HAZARD_TYPE), hazard: s(c.HAZARD_DESCRIPTION),
        min: nn(c.CRITICAL_LIMIT_MIN), max: nn(c.CRITICAL_LIMIT_MAX), frequency: s(c.MONITORING_FREQUENCY),
        corrective: s(c.CORRECTIVE_ACTION), last: last.get(n(c.ID)) ?? null,
      })),
    })),
    records,
    totals: { records: records.length, deviations: records.filter(r => !r.ok).length },
  };
}

// ── Blocked batches (DIPP FRUICT / warehouse) ────────────────────────────

export async function blockedBatches(lang: Lang) {
  const rows = await query<Row>(`
    SELECT b.ID, b.BATCH_NUMBER, b.CURRENT_QTY_KG, b.BLOCKED_BY, b.BLOCK_REASON, i.NAME_RO, i.NAME_RU, w.NAME AS WAREHOUSE_NAME,
           (SELECT MAX(bb.BLOCKED_AT) FROM AGRO_BATCH_BLOCKS bb WHERE bb.BATCH_ID = b.ID AND bb.UNBLOCKED_AT IS NULL) AS BLOCKED_AT
    FROM AGRO_BATCHES b
    LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
    LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
    WHERE b.STATUS = 'blocked'
    ORDER BY b.ID DESC`, []);
  return rows.map(r => ({
    id: n(r.ID), batch_number: s(r.BATCH_NUMBER), qty_kg: n(r.CURRENT_QTY_KG), item: pickName(lang, r.NAME_RO, r.NAME_RU),
    warehouse: s(r.WAREHOUSE_NAME), blocked_by: s(r.BLOCKED_BY), reason: s(r.BLOCK_REASON), blocked_at: iso(r.BLOCKED_AT),
  }));
}

// ── Checklist templates (DIPP FRUICT QA → «Чек-листы», read-only) ────────

export async function checklists(lang: Lang) {
  const [lists, items, used] = await Promise.all([
    query<Row>(`SELECT ID, CODE, NAME_RO, NAME_RU, CHECKLIST_TYPE, ACTIVE FROM AGRO_QA_CHECKLISTS ORDER BY CODE`, []),
    query<Row>(`SELECT ID, CHECKLIST_ID, ITEM_ORDER, PARAMETER_NAME_RO, PARAMETER_NAME_RU, VALUE_TYPE, MIN_VALUE, MAX_VALUE, CHOICES, IS_CRITICAL
                FROM AGRO_QA_CHECKLIST_ITEMS ORDER BY CHECKLIST_ID, ITEM_ORDER, ID`, []),
    query<Row>(`SELECT CHECKLIST_ID, COUNT(*) AS N, MAX(CHECK_DATE) AS LAST FROM AGRO_QA_CHECKS GROUP BY CHECKLIST_ID`, []),
  ]);
  const use = new Map(used.map(u => [n(u.CHECKLIST_ID), { checks: n(u.N), last: iso(u.LAST) }]));
  return lists.map(l => ({
    id: n(l.ID), code: s(l.CODE), name: pickName(lang, l.NAME_RO, l.NAME_RU), type: s(l.CHECKLIST_TYPE), active: s(l.ACTIVE) !== "N",
    checks: use.get(n(l.ID))?.checks ?? 0, last_check: use.get(n(l.ID))?.last ?? null,
    items: items.filter(i => n(i.CHECKLIST_ID) === n(l.ID)).map(i => ({
      id: n(i.ID), order: n(i.ITEM_ORDER), name: pickName(lang, i.PARAMETER_NAME_RO, i.PARAMETER_NAME_RU),
      value_type: s(i.VALUE_TYPE), min: nn(i.MIN_VALUE), max: nn(i.MAX_VALUE), choices: s(i.CHOICES), critical: s(i.IS_CRITICAL) === "Y",
    })),
  }));
}
