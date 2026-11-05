// Quality: customer complaints (CRM-only, AGRO_CRM_COMPLAINTS — full edit)
// plus a read-only view of what DIPP FRUICT records: QA checks, HACCP
// measurements and blocked batches. QA checks / HACCP measurements are made
// in DIPP FRUICT (a failed check auto-blocks the batch there), so the CRM
// only lists, inspects and prints them.
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";
import { tx } from "@/lib/receivables";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const CATEGORIES = ["quality", "quantity", "packaging", "delivery", "documents", "other"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
export const STATUSES   = ["new", "in_progress", "resolved", "rejected"] as const;
export const RESOLUTIONS = ["refund", "discount", "replacement", "return", "none"] as const;
const CLOSED = ["resolved", "rejected"];

export class QualityError extends Error {}

// ── Complaints ───────────────────────────────────────────────────────────

export interface ComplaintFilters {
  date_from: string | null; date_to: string | null; customer_id: number | null;
  status: string | null; category: string | null; q: string | null; open: boolean;
}

export function parseComplaintFilters(sp: URLSearchParams): ComplaintFilters {
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const pick = (k: string, list: readonly string[]) => { const v = sp.get(k) ?? ""; return list.includes(v) ? v : null; };
  const cust = Number(sp.get("customer_id"));
  return {
    date_from: d("date_from"), date_to: d("date_to"), customer_id: cust > 0 ? cust : null,
    status: pick("status", STATUSES), category: pick("category", CATEGORIES),
    q: (sp.get("q") ?? "").trim().slice(0, 60) || null, open: sp.get("open") === "1",
  };
}

const COMPLAINT_SELECT = `
  SELECT c.ID, c.COMPLAINT_NUMBER, c.CUSTOMER_ID, cu.NAME AS CUSTOMER_NAME, c.SALES_DOC_ID,
         NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS SALE_NUMBER, sd.DOC_DATE AS SALE_DATE,
         c.BATCH_ID, b.BATCH_NUMBER, c.RECEIVED_DATE, c.CATEGORY, c.SEVERITY, c.DESCRIPTION,
         c.QTY_KG, c.CLAIM_AMOUNT, c.CURRENCY_CODE, c.STATUS, c.RESPONSIBLE, c.DUE_DATE,
         c.RESOLUTION, c.RESOLUTION_NOTES, c.COMPENSATION_AMOUNT, c.RESOLVED_BY, c.RESOLVED_AT,
         c.CREATED_BY, c.CREATED_AT, c.UPDATED_AT
  FROM AGRO_CRM_COMPLAINTS c
  JOIN AGRO_CUSTOMERS cu ON cu.ID = c.CUSTOMER_ID
  LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = c.SALES_DOC_ID
  LEFT JOIN AGRO_BATCHES b ON b.ID = c.BATCH_ID`;

function mapComplaint(r: Row) {
  const status = s(r.STATUS);
  const due = r.DUE_DATE instanceof Date ? r.DUE_DATE : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return {
    id: n(r.ID), number: s(r.COMPLAINT_NUMBER), customer_id: n(r.CUSTOMER_ID), customer_name: s(r.CUSTOMER_NAME),
    sales_doc_id: nn(r.SALES_DOC_ID), sale_number: s(r.SALE_NUMBER), sale_date: iso(r.SALE_DATE),
    batch_id: nn(r.BATCH_ID), batch_number: s(r.BATCH_NUMBER),
    received_date: iso(r.RECEIVED_DATE), category: s(r.CATEGORY), severity: s(r.SEVERITY), description: s(r.DESCRIPTION),
    qty_kg: nn(r.QTY_KG), claim_amount: nn(r.CLAIM_AMOUNT), currency: s(r.CURRENCY_CODE) || "MDL",
    status, responsible: s(r.RESPONSIBLE), due_date: iso(r.DUE_DATE),
    overdue: !!due && !CLOSED.includes(status) && due < today,
    resolution: s(r.RESOLUTION), resolution_notes: s(r.RESOLUTION_NOTES), compensation_amount: nn(r.COMPENSATION_AMOUNT),
    resolved_by: s(r.RESOLVED_BY), resolved_at: iso(r.RESOLVED_AT),
    created_by: s(r.CREATED_BY), created_at: iso(r.CREATED_AT), updated_at: iso(r.UPDATED_AT),
  };
}
export type Complaint = ReturnType<typeof mapComplaint>;

export async function listComplaints(f: ComplaintFilters) {
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  if (f.date_from)   { w.push("c.RECEIVED_DATE >= TO_DATE(:dfrom, 'YYYY-MM-DD')"); b.dfrom = f.date_from; }
  if (f.date_to)     { w.push("c.RECEIVED_DATE < TO_DATE(:dto, 'YYYY-MM-DD') + 1"); b.dto = f.date_to; }
  if (f.customer_id) { w.push("c.CUSTOMER_ID = :cust"); b.cust = f.customer_id; }
  if (f.status)      { w.push("c.STATUS = :st"); b.st = f.status; }
  if (f.open)        w.push("c.STATUS IN ('new', 'in_progress')");
  if (f.category)    { w.push("c.CATEGORY = :cat"); b.cat = f.category; }
  if (f.q) {
    w.push("(UPPER(c.COMPLAINT_NUMBER) LIKE :q OR UPPER(cu.NAME) LIKE :q OR UPPER(c.DESCRIPTION) LIKE :q OR UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q OR UPPER(b.BATCH_NUMBER) LIKE :q)");
    b.q = `%${f.q.toUpperCase()}%`;
  }
  const rows = await query<Row>(`
    SELECT * FROM (${COMPLAINT_SELECT} ${w.length ? "WHERE " + w.join(" AND ") : ""}
                   ORDER BY c.RECEIVED_DATE DESC, c.ID DESC) WHERE ROWNUM <= 2000`, b);
  const list = rows.map(mapComplaint);
  const open = list.filter(c => !CLOSED.includes(c.status));
  return {
    rows: list,
    totals: {
      count: list.length, open: open.length, overdue: open.filter(c => c.overdue).length,
      high: open.filter(c => c.severity === "high").length,
      resolved: list.filter(c => c.status === "resolved").length,
      rejected: list.filter(c => c.status === "rejected").length,
    },
  };
}

export async function complaintDetail(id: number) {
  const [rows, hist] = await Promise.all([
    query<Row>(`${COMPLAINT_SELECT} WHERE c.ID = :1`, [id]),
    query<Row>(`SELECT ACTION, CHANGED_BY, CHANGED_AT, NEW_VALUES FROM AGRO_CRM_AUDIT_LOG
                WHERE ENTITY_TYPE = 'complaint' AND ENTITY_ID = :1 ORDER BY CHANGED_AT DESC, ID DESC`, [id]),
  ]);
  if (!rows.length) return null;
  return {
    ...mapComplaint(rows[0]),
    history: hist.map(h => {
      let changes: Record<string, unknown> = {};
      try { changes = JSON.parse(s(h.NEW_VALUES)) ?? {}; } catch { /* old/foreign row */ }
      return { action: s(h.ACTION), by: s(h.CHANGED_BY), at: iso(h.CHANGED_AT), changes };
    }),
  };
}

// Customers and active staff for the complaint form pickers.
export async function complaintLookups() {
  const [cust, users] = await Promise.all([
    query<Row>(`SELECT ID, NAME FROM AGRO_CUSTOMERS WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY NAME`, []),
    query<Row>(`SELECT USERNAME, NVL(FULL_NAME, TRIM(FIRST_NAME || ' ' || LAST_NAME)) AS NM FROM AGRO_USERS
                WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY USERNAME`, []),
  ]);
  return {
    customers: cust.map(c => ({ id: n(c.ID), name: s(c.NAME) })),
    users: users.map(u => ({ username: s(u.USERNAME), name: s(u.NM) || s(u.USERNAME) })),
  };
}

// Sales documents of the customer (newest first) with the batches shipped
// in each — for the "what is the claim about" pickers in the form. Batches
// come from AGRO_BATCH_ALLOCATIONS: DIPP FRUICT leaves SALES_LINES.BATCH_ID empty.
export async function complaintOptions(customerId: number, lang: Lang) {
  const docs = await query<Row>(`
    SELECT * FROM (
      SELECT sd.ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS NUM, sd.DOC_DATE, NVL(sd.CURRENCY_CODE, 'MDL') AS CUR
      FROM AGRO_SALES_DOCS sd WHERE sd.CUSTOMER_ID = :1
      ORDER BY sd.DOC_DATE DESC, sd.ID DESC
    ) WHERE ROWNUM <= 200`, [customerId]);
  const ids = docs.map(d => n(d.ID));
  const lines = ids.length ? await query<Row>(`
    SELECT DISTINCT sl.SALES_DOC_ID, b.ID AS BATCH_ID, b.BATCH_NUMBER, i.NAME_RO, i.NAME_RU
    FROM AGRO_SALES_LINES sl
    JOIN AGRO_BATCH_ALLOCATIONS ba ON ba.SALES_LINE_ID = sl.ID
    JOIN AGRO_BATCHES b ON b.ID = ba.BATCH_ID
    LEFT JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
    WHERE sl.SALES_DOC_ID IN (${ids.map((_, i) => `:b${i}`).join(",")})`,
    Object.fromEntries(ids.map((v, i) => [`b${i}`, v]))) : [];
  return {
    docs: docs.map(d => ({
      id: n(d.ID), number: s(d.NUM), date: iso(d.DOC_DATE), currency: s(d.CUR),
      batches: lines.filter(l => n(l.SALES_DOC_ID) === n(d.ID))
        .map(l => ({ id: n(l.BATCH_ID), number: s(l.BATCH_NUMBER), item: pickName(lang, l.NAME_RO, l.NAME_RU) })),
    })),
  };
}

export interface ComplaintInput {
  customer_id: number; sales_doc_id: number | null; batch_id: number | null; received_date: string;
  category: string; severity: string; description: string; qty_kg: number | null; claim_amount: number | null;
  currency: string | null; responsible: string | null; due_date: string | null;
}

function num(v: unknown, label: string) {
  if (v == null || String(v).trim() === "") return null;
  const x = Number(String(v).replace(",", "."));
  if (!(x >= 0) || x > 1e11) throw new QualityError(`${label}: неверное число`);
  return Math.round(x * 1000) / 1000;
}
function date(v: unknown, label: string, required = false) {
  const x = String(v ?? "").trim();
  if (!x) { if (required) throw new QualityError(`Укажите: ${label}`); return null; }
  if (!ISO.test(x)) throw new QualityError(`${label}: неверная дата`);
  return x;
}
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

export function parseComplaint(b: Record<string, unknown>): ComplaintInput {
  const cust = Number(b.customer_id);
  if (!(cust > 0)) throw new QualityError("Не выбран клиент");
  const category = String(b.category ?? "");
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new QualityError("Неверный тип претензии");
  const severity = String(b.severity ?? "medium");
  if (!(SEVERITIES as readonly string[]).includes(severity)) throw new QualityError("Неверная важность");
  const description = text(b.description, 2000);
  if (!description) throw new QualityError("Опишите претензию");
  const received = date(b.received_date, "дата получения", true)!;
  if (new Date(`${received}T00:00:00`) > new Date(Date.now() + 86400000)) throw new QualityError("Дата получения в будущем");
  const amount = num(b.claim_amount, "Сумма претензии");
  const currency = String(b.currency ?? "").trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new QualityError("Неверная валюта");
  const doc = Number(b.sales_doc_id), batch = Number(b.batch_id);
  return {
    customer_id: cust, sales_doc_id: doc > 0 ? doc : null, batch_id: batch > 0 ? batch : null,
    received_date: received, category, severity, description,
    qty_kg: num(b.qty_kg, "Количество"), claim_amount: amount == null ? null : Math.round(amount * 100) / 100,
    currency: currency || (amount != null ? "MDL" : null),
    responsible: text(b.responsible, 100), due_date: date(b.due_date, "срок"),
  };
}

// The sale must be the customer's, the batch must have been shipped in it
// (or, without a sale, at least exist).
async function checkLinks(p: ComplaintInput) {
  const cust = await query<Row>(`SELECT NAME FROM AGRO_CUSTOMERS WHERE ID = :1`, [p.customer_id]);
  if (!cust.length) throw new QualityError("Клиент не найден");
  if (p.sales_doc_id) {
    const d = await query<Row>(`SELECT CUSTOMER_ID FROM AGRO_SALES_DOCS WHERE ID = :1`, [p.sales_doc_id]);
    if (!d.length) throw new QualityError("Продажа не найдена");
    if (n(d[0].CUSTOMER_ID) !== p.customer_id) throw new QualityError("Продажа другого клиента");
  }
  if (p.batch_id) {
    const ok = p.sales_doc_id
      ? await query<Row>(`SELECT 1 AS X FROM AGRO_SALES_LINES sl JOIN AGRO_BATCH_ALLOCATIONS ba ON ba.SALES_LINE_ID = sl.ID
                          WHERE sl.SALES_DOC_ID = :1 AND ba.BATCH_ID = :2 AND ROWNUM = 1`, [p.sales_doc_id, p.batch_id])
      : await query<Row>(`SELECT 1 AS X FROM AGRO_BATCHES WHERE ID = :1`, [p.batch_id]);
    if (!ok.length) throw new QualityError(p.sales_doc_id ? "Эта партия не отгружалась в выбранной продаже" : "Партия не найдена");
  }
  return s(cust[0].NAME);
}

async function checkUser(username: string | null) {
  if (!username) return;
  const u = await query<Row>(`SELECT 1 AS X FROM AGRO_USERS WHERE USERNAME = :1 AND NVL(ACTIVE, 'Y') = 'Y'`, [username]);
  if (!u.length) throw new QualityError("Ответственный не найден");
}

export async function createComplaint(p: ComplaintInput, user: string, dryRun = false) {
  const customerName = await checkLinks(p);
  await checkUser(p.responsible);
  return tx(dryRun, async exec => {
    const id = n((await exec(`SELECT AGRO_CRM_COMPLAINTS_SEQ.NEXTVAL AS V FROM DUAL`, {}))[0].V);
    const number = `CLM-${p.received_date.replace(/-/g, "")}-${String(id).padStart(4, "0")}`;
    await exec(`
      INSERT INTO AGRO_CRM_COMPLAINTS (ID, COMPLAINT_NUMBER, CUSTOMER_ID, SALES_DOC_ID, BATCH_ID, RECEIVED_DATE, CATEGORY,
                                       SEVERITY, DESCRIPTION, QTY_KG, CLAIM_AMOUNT, CURRENCY_CODE, STATUS, RESPONSIBLE, DUE_DATE, CREATED_BY)
      VALUES (:id, :num, :cust, :doc, :batch, TO_DATE(:rd, 'YYYY-MM-DD'), :cat, :sev, :descr, :qty, :amt, :cur, 'new',
              :resp, TO_DATE(:due, 'YYYY-MM-DD'), :usr)`,
      { id, num: number, cust: p.customer_id, doc: p.sales_doc_id, batch: p.batch_id, rd: p.received_date,
        cat: p.category, sev: p.severity, descr: p.description, qty: p.qty_kg, amt: p.claim_amount, cur: p.currency,
        resp: p.responsible, due: p.due_date, usr: user });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, NEW_VALUES)
                VALUES ('complaint', :id, :name, 'create', :usr, :new)`,
      { id, name: `${number} · ${customerName}`.slice(0, 200), usr: user, new: JSON.stringify(p) });
    return { id, number };
  });
}

// Edit the claim and/or move it through its statuses. Closing (resolved /
// rejected) needs a resolution note; resolved also needs the resolution type.
// Reopening clears the resolution stamp but keeps the notes for history.
export async function updateComplaint(id: number, b: Record<string, unknown>, user: string, dryRun = false) {
  const cur = await complaintDetail(id);
  if (!cur) throw new QualityError("Претензия не найдена");
  const p = parseComplaint({
    customer_id: cur.customer_id, sales_doc_id: cur.sales_doc_id, batch_id: cur.batch_id,
    received_date: cur.received_date?.slice(0, 10), category: cur.category, severity: cur.severity,
    description: cur.description, qty_kg: cur.qty_kg, claim_amount: cur.claim_amount, currency: cur.claim_amount != null ? cur.currency : "",
    responsible: cur.responsible, due_date: cur.due_date?.slice(0, 10) ?? "",
    ...b,
  });
  const status = String(b.status ?? cur.status);
  if (!(STATUSES as readonly string[]).includes(status)) throw new QualityError("Неверный статус");
  const resolution = b.resolution !== undefined ? text(b.resolution, 20) : cur.resolution || null;
  if (resolution && !(RESOLUTIONS as readonly string[]).includes(resolution)) throw new QualityError("Неверное решение");
  const notes = b.resolution_notes !== undefined ? text(b.resolution_notes, 2000) : cur.resolution_notes || null;
  const comp = b.compensation_amount !== undefined ? num(b.compensation_amount, "Компенсация") : cur.compensation_amount;
  const closing = CLOSED.includes(status);
  if (closing && !notes) throw new QualityError("Опишите решение по претензии");
  if (status === "resolved" && !resolution) throw new QualityError("Выберите, как решена претензия");

  if (p.customer_id !== cur.customer_id || p.sales_doc_id !== cur.sales_doc_id || p.batch_id !== cur.batch_id) await checkLinks(p);
  if (p.responsible !== (cur.responsible || null)) await checkUser(p.responsible);

  const next = {
    ...p, status, resolution, resolution_notes: notes,
    compensation_amount: comp == null ? null : Math.round(comp * 100) / 100,
  };
  const before: Record<string, unknown> = {
    customer_id: cur.customer_id, sales_doc_id: cur.sales_doc_id, batch_id: cur.batch_id,
    received_date: cur.received_date?.slice(0, 10) ?? null, category: cur.category, severity: cur.severity,
    description: cur.description, qty_kg: cur.qty_kg, claim_amount: cur.claim_amount,
    currency: cur.claim_amount != null ? cur.currency : null, responsible: cur.responsible || null,
    due_date: cur.due_date?.slice(0, 10) ?? null, status: cur.status, resolution: cur.resolution || null,
    resolution_notes: cur.resolution_notes || null, compensation_amount: cur.compensation_amount,
  };
  const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? null)));
  if (!Object.keys(changes).length) return { id, changed: false };

  const wasClosed = CLOSED.includes(cur.status);
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_COMPLAINTS SET
        CUSTOMER_ID = :cust, SALES_DOC_ID = :doc, BATCH_ID = :batch, RECEIVED_DATE = TO_DATE(:rd, 'YYYY-MM-DD'),
        CATEGORY = :cat, SEVERITY = :sev, DESCRIPTION = :descr, QTY_KG = :qty, CLAIM_AMOUNT = :amt, CURRENCY_CODE = :cur,
        RESPONSIBLE = :resp, DUE_DATE = TO_DATE(:due, 'YYYY-MM-DD'), STATUS = :st, RESOLUTION = :res,
        RESOLUTION_NOTES = :notes, COMPENSATION_AMOUNT = :comp, UPDATED_AT = SYSDATE,
        RESOLVED_BY = CASE WHEN :closing = 1 THEN ${wasClosed ? "NVL(RESOLVED_BY, :usr)" : ":usr"} ELSE NULL END,
        RESOLVED_AT = CASE WHEN :closing = 1 THEN ${wasClosed ? "NVL(RESOLVED_AT, SYSDATE)" : "SYSDATE"} ELSE NULL END
      WHERE ID = :id`,
      { id, cust: next.customer_id, doc: next.sales_doc_id, batch: next.batch_id, rd: next.received_date,
        cat: next.category, sev: next.severity, descr: next.description, qty: next.qty_kg, amt: next.claim_amount,
        cur: next.currency, resp: next.responsible, due: next.due_date, st: status, res: next.resolution,
        notes: next.resolution_notes, comp: next.compensation_amount, closing: closing ? 1 : 0, usr: user });
    const action = status !== cur.status ? (closing ? status : wasClosed ? "reopen" : "status") : "update";
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
                VALUES ('complaint', :id, :name, :act, :usr, :old, :new)`,
      { id, name: `${cur.number} · ${cur.customer_name}`.slice(0, 200), act: action, usr: user,
        old: JSON.stringify(Object.fromEntries(Object.keys(changes).map(k => [k, before[k] ?? null]))), new: JSON.stringify(changes) });
    return { id, changed: true };
  });
}

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
           (SELECT MAX(bb.BLOCKED_AT) FROM AGRO_BATCH_BLOCKS bb WHERE bb.BATCH_ID = b.ID AND bb.UNBLOCKED_AT IS NULL) AS BLOCKED_AT,
           (SELECT COUNT(*) FROM AGRO_CRM_COMPLAINTS c WHERE c.BATCH_ID = b.ID) AS COMPLAINTS
    FROM AGRO_BATCHES b
    LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
    LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
    WHERE b.STATUS = 'blocked'
    ORDER BY b.ID DESC`, []);
  return rows.map(r => ({
    id: n(r.ID), batch_number: s(r.BATCH_NUMBER), qty_kg: n(r.CURRENT_QTY_KG), item: pickName(lang, r.NAME_RO, r.NAME_RU),
    warehouse: s(r.WAREHOUSE_NAME), blocked_by: s(r.BLOCKED_BY), reason: s(r.BLOCK_REASON), blocked_at: iso(r.BLOCKED_AT),
    complaints: n(r.COMPLAINTS),
  }));
}
