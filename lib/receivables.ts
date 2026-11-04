// Customer receivables: what each customer owes per currency, built from
// DIPP FRUICT's shipped sales documents and returns plus the CRM's own
// payments (AGRO_CRM_PAYMENTS). Payments linked to a document go to that
// document first; payments "on account" — and any overpayment of a linked
// document — are applied FIFO to the oldest open documents of the same
// customer and currency. What's left over is the customer's credit.
import oracledb from "oracledb";
import { query, getConnection } from "@/lib/oracle";
import { rateOn } from "@/lib/rates";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const isoD = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const DAY = 86_400_000;

// A sales document counts as invoiced once shipped.
const BILLED = "'shipped','delivered','closed','returned'";
export const METHODS = ["bank", "cash", "card", "offset", "other"] as const;
export const AGING = ["not_due", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
type Aging = (typeof AGING)[number];

export class PayError extends Error {}

export async function defaultPaymentDays(): Promise<number> {
  const r = await query<Row>(`SELECT CONFIG_VALUE FROM AGRO_MODULE_CONFIG WHERE CONFIG_KEY = 'CRM_DEFAULT_PAYMENT_DAYS'`);
  const v = Number(r[0]?.CONFIG_VALUE);
  return Number.isFinite(v) && v >= 0 ? v : 30;
}

interface Doc {
  id: number; customer_id: number; number: string; date: Date; currency: string;
  total: number; returned: number; net: number; paid: number; remaining: number;
  due_date: Date; days_overdue: number; status: "paid" | "partial" | "unpaid" | "overdue";
}
interface Pay {
  id: number; number: string; customer_id: number; sales_doc_id: number | null; date: Date;
  amount: number; currency: string; amount_mdl: number | null; method: string; reference: string;
  notes: string; status: string; created_by: string; cancelled_by: string; cancelled_at: string | null; cancel_reason: string;
}

async function loadLedger(customerId: number | null) {
  const cust = customerId ? " AND sd.CUSTOMER_ID = :cust" : "";
  const binds = customerId ? { cust: customerId } : {};
  const [docRows, payRows, termRows, defDays] = await Promise.all([
    query<Row>(`
      SELECT sd.ID, sd.CUSTOMER_ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS NUM, sd.DOC_DATE,
             NVL(sd.CURRENCY_CODE, 'MDL') AS CUR, NVL(sd.TOTAL_AMOUNT, 0) AS TOTAL,
             (SELECT NVL(SUM(rl.AMOUNT), 0) FROM AGRO_SALES_RETURN_LINES rl
                JOIN AGRO_SALES_RETURNS r ON r.ID = rl.RETURN_ID AND NVL(r.STATUS, 'active') <> 'cancelled'
               WHERE r.SALES_DOC_ID = sd.ID) AS RETURNED
      FROM AGRO_SALES_DOCS sd
      WHERE sd.STATUS IN (${BILLED}) AND sd.CUSTOMER_ID IS NOT NULL${cust}
      ORDER BY sd.DOC_DATE, sd.ID`, binds),
    query<Row>(`
      SELECT p.* FROM AGRO_CRM_PAYMENTS p
      WHERE 1=1${customerId ? " AND p.CUSTOMER_ID = :cust" : ""}
      ORDER BY p.PAY_DATE, p.ID`, binds),
    query<Row>(`SELECT CUSTOMER_ID, PAYMENT_DAYS, CREDIT_LIMIT_MDL FROM AGRO_CRM_CUSTOMER_TERMS`),
    defaultPaymentDays(),
  ]);
  const terms = new Map(termRows.map(t => [n(t.CUSTOMER_ID), {
    days: t.PAYMENT_DAYS != null ? n(t.PAYMENT_DAYS) : null,
    limit: t.CREDIT_LIMIT_MDL != null ? n(t.CREDIT_LIMIT_MDL) : null,
  }]));
  const pays: Pay[] = payRows.map(p => ({
    id: n(p.ID), number: s(p.PAYMENT_NUMBER), customer_id: n(p.CUSTOMER_ID),
    sales_doc_id: p.SALES_DOC_ID != null ? n(p.SALES_DOC_ID) : null, date: p.PAY_DATE as Date,
    amount: n(p.AMOUNT), currency: s(p.CURRENCY_CODE), amount_mdl: p.AMOUNT_MDL != null ? n(p.AMOUNT_MDL) : null,
    method: s(p.METHOD), reference: s(p.REFERENCE), notes: s(p.NOTES), status: s(p.STATUS),
    created_by: s(p.CREATED_BY), cancelled_by: s(p.CANCELLED_BY), cancelled_at: isoD(p.CANCELLED_AT), cancel_reason: s(p.CANCEL_REASON),
  }));
  return { docRows, pays, terms, defDays };
}

// Exported for unit checks only.
export function compute(ledger: Awaited<ReturnType<typeof loadLedger>>, asOf = new Date()) {
  const { docRows, pays, terms, defDays } = ledger;
  const docs: Doc[] = docRows.map(r => {
    const days = terms.get(n(r.CUSTOMER_ID))?.days ?? defDays;
    const date = r.DOC_DATE as Date;
    const net = Math.max(0, n(r.TOTAL) - n(r.RETURNED));
    return {
      id: n(r.ID), customer_id: n(r.CUSTOMER_ID), number: s(r.NUM), date, currency: s(r.CUR),
      total: n(r.TOTAL), returned: n(r.RETURNED), net, paid: 0, remaining: net,
      due_date: new Date(date.getTime() + days * DAY), days_overdue: 0, status: "unpaid",
    };
  });
  const byId = new Map(docs.map(d => [d.id, d]));
  const credit = new Map<string, number>();              // "customer|currency" → unapplied
  const key = (c: number, cur: string) => `${c}|${cur}`;
  const active = pays.filter(p => p.status === "active");

  // 1) linked payments → their own document; overpayment becomes credit
  for (const p of active.filter(p => p.sales_doc_id != null)) {
    const d = byId.get(p.sales_doc_id!);
    if (!d || d.currency !== p.currency) { credit.set(key(p.customer_id, p.currency), (credit.get(key(p.customer_id, p.currency)) ?? 0) + p.amount); continue; }
    const used = Math.min(d.remaining, p.amount);
    d.paid += used; d.remaining -= used;
    if (p.amount > used) credit.set(key(p.customer_id, p.currency), (credit.get(key(p.customer_id, p.currency)) ?? 0) + (p.amount - used));
  }
  // 2) on-account payments join the credit pool
  for (const p of active.filter(p => p.sales_doc_id == null)) {
    credit.set(key(p.customer_id, p.currency), (credit.get(key(p.customer_id, p.currency)) ?? 0) + p.amount);
  }
  // 3) credit pool → oldest open documents, FIFO
  for (const d of docs) {
    const k = key(d.customer_id, d.currency);
    const c = credit.get(k) ?? 0;
    if (c <= 0 || d.remaining <= 0) continue;
    const used = Math.min(c, d.remaining);
    d.paid += used; d.remaining -= used; credit.set(k, c - used);
  }
  for (const d of docs) {
    d.paid = r2(d.paid); d.remaining = r2(d.remaining);
    d.days_overdue = d.remaining > 0 ? Math.max(0, Math.floor((asOf.getTime() - d.due_date.getTime()) / DAY)) : 0;
    d.status = d.remaining <= 0.005 ? "paid" : d.days_overdue > 0 ? "overdue" : d.paid > 0 ? "partial" : "unpaid";
  }
  return { docs, credit, pays, terms, defDays };
}

function agingOf(daysOverdue: number): Aging {
  if (daysOverdue <= 0) return "not_due";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

export async function receivablesSummary() {
  const c = compute(await loadLedger(null));
  const names = new Map((await query<Row>(`SELECT ID, NAME FROM AGRO_CUSTOMERS`)).map(r => [n(r.ID), s(r.NAME)]));
  const groups = new Map<string, {
    customer_id: number; customer_name: string; currency: string;
    billed: number; returned: number; paid: number; balance: number; overdue: number; credit: number;
    aging: Record<Aging, number>; open_docs: number; oldest_overdue_days: number; last_payment: string | null;
    payment_days: number; credit_limit_mdl: number | null;
  }>();
  for (const d of c.docs) {
    const k = `${d.customer_id}|${d.currency}`;
    const t = c.terms.get(d.customer_id);
    const g = groups.get(k) ?? {
      customer_id: d.customer_id, customer_name: names.get(d.customer_id) ?? "", currency: d.currency,
      billed: 0, returned: 0, paid: 0, balance: 0, overdue: 0, credit: 0,
      aging: Object.fromEntries(AGING.map(a => [a, 0])) as Record<Aging, number>, open_docs: 0, oldest_overdue_days: 0,
      last_payment: null, payment_days: t?.days ?? c.defDays, credit_limit_mdl: t?.limit ?? null,
    };
    g.billed += d.total; g.returned += d.returned; g.paid += d.paid;
    if (d.remaining > 0) {
      g.balance += d.remaining; g.open_docs += 1;
      g.aging[agingOf(d.days_overdue)] += d.remaining;
      if (d.days_overdue > 0) { g.overdue += d.remaining; g.oldest_overdue_days = Math.max(g.oldest_overdue_days, d.days_overdue); }
    }
    groups.set(k, g);
  }
  for (const p of c.pays.filter(p => p.status === "active")) {
    const g = groups.get(`${p.customer_id}|${p.currency}`);
    if (g && (!g.last_payment || p.date.toISOString() > g.last_payment)) g.last_payment = p.date.toISOString();
  }
  for (const [k, v] of c.credit) { const g = groups.get(k); if (g) g.credit = r2(v); }

  // MDL equivalents at today's rate, for sorting, totals and the credit limit.
  const today = new Date().toISOString().slice(0, 10);
  const rates = new Map<string, number | null>();
  for (const cur of new Set([...groups.values()].map(g => g.currency))) rates.set(cur, await rateOn(cur, today));
  const rows = [...groups.values()].map(g => {
    const rate = rates.get(g.currency) ?? null;
    const balance = r2(g.balance - g.credit);
    return {
      ...g, billed: r2(g.billed), returned: r2(g.returned), paid: r2(g.paid), overdue: r2(g.overdue),
      balance, balance_mdl: rate != null ? r2(balance * rate) : null, overdue_mdl: rate != null ? r2(g.overdue * rate) : null,
      aging: Object.fromEntries(AGING.map(a => [a, r2(g.aging[a])])) as Record<Aging, number>,
      over_limit: g.credit_limit_mdl != null && rate != null && balance * rate > g.credit_limit_mdl,
    };
  }).sort((a, b) => (b.overdue_mdl ?? 0) - (a.overdue_mdl ?? 0) || (b.balance_mdl ?? 0) - (a.balance_mdl ?? 0));

  const sum = (f: (r: (typeof rows)[number]) => number | null) => r2(rows.reduce((a, r) => a + (f(r) ?? 0), 0));
  const agingMdl = Object.fromEntries(AGING.map(a => [a, sum(r => (r.aging[a] * (rates.get(r.currency) ?? 0)))])) as Record<Aging, number>;
  return {
    rows, default_payment_days: c.defDays,
    totals: {
      balance_mdl: sum(r => r.balance_mdl), overdue_mdl: sum(r => r.overdue_mdl), aging_mdl: agingMdl,
      debtors: rows.filter(r => r.balance > 0.005).length, overdue_customers: rows.filter(r => r.overdue > 0.005).length,
      paid_mdl: sum(r => r.paid * (rates.get(r.currency) ?? 0)),
    },
    rates: Object.fromEntries(rates),
  };
}

export async function customerLedger(customerId: number) {
  const c = compute(await loadLedger(customerId));
  const cust = await query<Row>(`SELECT ID, NAME, TAX_ID, ADDRESS FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]);
  if (!cust.length) throw new PayError("Клиент не найден");
  const t = c.terms.get(customerId);
  return {
    customer: { id: customerId, name: s(cust[0].NAME), tax_id: s(cust[0].TAX_ID), address: s(cust[0].ADDRESS) },
    terms: { payment_days: t?.days ?? null, credit_limit_mdl: t?.limit ?? null, default_days: c.defDays },
    docs: c.docs.slice().reverse().map(d => ({
      id: d.id, number: d.number, date: d.date.toISOString(), currency: d.currency, total: r2(d.total),
      returned: r2(d.returned), paid: d.paid, remaining: d.remaining, due_date: d.due_date.toISOString(),
      days_overdue: d.days_overdue, status: d.status,
    })),
    payments: c.pays.slice().reverse().map(p => ({ ...p, date: p.date.toISOString() })),
    credit: Object.fromEntries([...c.credit].filter(([, v]) => v > 0.005).map(([k, v]) => [k.split("|")[1], r2(v)])),
  };
}

// ── Payments journal ─────────────────────────────────────────────────────
export async function listPayments(f: { date_from: string | null; date_to: string | null; customer_id: number | null; method: string | null; status: string | null; q: string | null }) {
  const w: string[] = []; const b: Record<string, string | number> = {};
  if (f.date_from) { w.push("p.PAY_DATE >= TO_DATE(:dfrom, 'YYYY-MM-DD')"); b.dfrom = f.date_from; }
  if (f.date_to)   { w.push("p.PAY_DATE < TO_DATE(:dto, 'YYYY-MM-DD') + 1"); b.dto = f.date_to; }
  if (f.customer_id) { w.push("p.CUSTOMER_ID = :cust"); b.cust = f.customer_id; }
  if (f.method) { w.push("p.METHOD = :m"); b.m = f.method; }
  if (f.status) { w.push("p.STATUS = :st"); b.st = f.status; }
  if (f.q) { w.push("(UPPER(p.PAYMENT_NUMBER) LIKE :q OR UPPER(p.REFERENCE) LIKE :q OR UPPER(c.NAME) LIKE :q OR UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q)"); b.q = `%${f.q.toUpperCase()}%`; }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT p.ID, p.PAYMENT_NUMBER, p.PAY_DATE, p.AMOUNT, p.CURRENCY_CODE, p.AMOUNT_MDL, p.METHOD, p.REFERENCE,
             p.NOTES, p.STATUS, p.CREATED_BY, p.CANCELLED_BY, p.CANCELLED_AT, p.CANCEL_REASON,
             c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME, sd.ID AS SALES_ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS SALE_NUMBER
      FROM AGRO_CRM_PAYMENTS p
      JOIN AGRO_CUSTOMERS c ON c.ID = p.CUSTOMER_ID
      LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = p.SALES_DOC_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY p.PAY_DATE DESC, p.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  return rows.map(r => ({
    id: n(r.ID), number: s(r.PAYMENT_NUMBER), date: isoD(r.PAY_DATE), amount: n(r.AMOUNT), currency: s(r.CURRENCY_CODE),
    amount_mdl: r.AMOUNT_MDL != null ? n(r.AMOUNT_MDL) : null, method: s(r.METHOD), reference: s(r.REFERENCE), notes: s(r.NOTES),
    status: s(r.STATUS), created_by: s(r.CREATED_BY), cancelled_by: s(r.CANCELLED_BY), cancelled_at: isoD(r.CANCELLED_AT),
    cancel_reason: s(r.CANCEL_REASON), customer_id: n(r.CUSTOMER_ID), customer_name: s(r.CUSTOMER_NAME),
    sales_id: r.SALES_ID != null ? n(r.SALES_ID) : null, sale_number: s(r.SALE_NUMBER),
  }));
}

// ── Writes (CRM-owned tables only) ───────────────────────────────────────
async function tx<T>(dryRun: boolean, fn: (exec: (sql: string, b: Record<string, unknown>) => Promise<Row[]>) => Promise<T>) {
  const conn = await getConnection();
  const exec = async (sql: string, b: Record<string, unknown>) =>
    ((await conn.execute(sql, b as never, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? []) as Row[];
  try {
    const out = await fn(exec);
    if (dryRun) await conn.rollback(); else await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.close();
  }
}

export interface NewPayment {
  customer_id: number; sales_doc_id: number | null; pay_date: string; amount: number;
  currency: string; method: string; reference: string | null; notes: string | null;
}

export function parsePayment(b: Record<string, unknown>): NewPayment {
  const cust = Number(b.customer_id), amount = Number(String(b.amount ?? "").replace(",", "."));
  const date = String(b.pay_date ?? "");
  const method = String(b.method ?? "bank");
  if (!(cust > 0)) throw new PayError("Не выбран клиент");
  if (!(amount > 0) || amount > 1e11) throw new PayError("Сумма должна быть больше нуля");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PayError("Неверная дата оплаты");
  if (new Date(`${date}T00:00:00`) > new Date(Date.now() + DAY)) throw new PayError("Дата оплаты в будущем");
  if (!(METHODS as readonly string[]).includes(method)) throw new PayError("Неверный способ оплаты");
  const currency = String(b.currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new PayError("Неверная валюта");
  const doc = Number(b.sales_doc_id);
  return {
    customer_id: cust, sales_doc_id: doc > 0 ? doc : null, pay_date: date, amount: r2(amount), currency, method,
    reference: String(b.reference ?? "").trim().slice(0, 100) || null, notes: String(b.notes ?? "").trim().slice(0, 500) || null,
  };
}

export async function addPayment(p: NewPayment, user: string, dryRun = false) {
  const cust = await query<Row>(`SELECT NAME FROM AGRO_CUSTOMERS WHERE ID = :1`, [p.customer_id]);
  if (!cust.length) throw new PayError("Клиент не найден");
  if (p.sales_doc_id) {
    const d = await query<Row>(`SELECT CUSTOMER_ID, NVL(CURRENCY_CODE, 'MDL') AS CUR, STATUS FROM AGRO_SALES_DOCS WHERE ID = :1`, [p.sales_doc_id]);
    if (!d.length) throw new PayError("Документ продажи не найден");
    if (n(d[0].CUSTOMER_ID) !== p.customer_id) throw new PayError("Документ продажи другого клиента");
    if (s(d[0].CUR) !== p.currency) throw new PayError(`Валюта оплаты должна совпадать с валютой накладной (${s(d[0].CUR)})`);
  }
  const rate = await rateOn(p.currency, p.pay_date);
  return tx(dryRun, async exec => {
    const id = n((await exec(`SELECT AGRO_CRM_PAYMENTS_SEQ.NEXTVAL AS V FROM DUAL`, {}))[0].V);
    const number = `PAY-${p.pay_date.replace(/-/g, "")}-${String(id).padStart(4, "0")}`;
    await exec(`
      INSERT INTO AGRO_CRM_PAYMENTS (ID, PAYMENT_NUMBER, CUSTOMER_ID, SALES_DOC_ID, PAY_DATE, AMOUNT, CURRENCY_CODE,
                                     RATE_TO_MDL, AMOUNT_MDL, METHOD, REFERENCE, NOTES, STATUS, CREATED_BY)
      VALUES (:id, :num, :cust, :doc, TO_DATE(:d, 'YYYY-MM-DD'), :amt, :cur, :rate, :mdl, :m, :ref, :notes, 'active', :usr)`,
      { id, num: number, cust: p.customer_id, doc: p.sales_doc_id, d: p.pay_date, amt: p.amount, cur: p.currency,
        rate, mdl: rate != null ? r2(p.amount * rate) : null, m: p.method, ref: p.reference, notes: p.notes, usr: user });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, NEW_VALUES)
                VALUES ('payment', :id, :name, 'create', :usr, :new)`,
      { id, name: `${number} · ${s(cust[0].NAME)}`.slice(0, 200), usr: user, new: JSON.stringify(p) });
    return { id, number, rate_to_mdl: rate };
  });
}

export async function cancelPayment(id: number, reason: string, user: string, dryRun = false) {
  const rows = await query<Row>(`SELECT PAYMENT_NUMBER, STATUS FROM AGRO_CRM_PAYMENTS WHERE ID = :1`, [id]);
  if (!rows.length) throw new PayError("Оплата не найдена");
  if (rows[0].STATUS === "cancelled") throw new PayError("Оплата уже отменена");
  if (!reason.trim()) throw new PayError("Укажите причину отмены");
  return tx(dryRun, async exec => {
    await exec(`UPDATE AGRO_CRM_PAYMENTS SET STATUS = 'cancelled', CANCELLED_BY = :usr, CANCELLED_AT = SYSDATE, CANCEL_REASON = :r WHERE ID = :id`,
      { id, usr: user, r: reason.slice(0, 500) });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, NEW_VALUES)
                VALUES ('payment', :id, :name, 'cancel', :usr, :new)`,
      { id, name: s(rows[0].PAYMENT_NUMBER), usr: user, new: JSON.stringify({ reason }) });
    return { id };
  });
}

export async function saveTerms(customerId: number, days: number | null, limit: number | null, user: string, dryRun = false) {
  if (days != null && (!Number.isInteger(days) || days < 0 || days > 3650)) throw new PayError("Отсрочка — от 0 до 3650 дней");
  if (limit != null && !(limit >= 0)) throw new PayError("Кредитный лимит не может быть отрицательным");
  return tx(dryRun, async exec => {
    await exec(`
      MERGE INTO AGRO_CRM_CUSTOMER_TERMS t USING (SELECT :c AS C FROM DUAL) s ON (t.CUSTOMER_ID = s.C)
      WHEN MATCHED THEN UPDATE SET PAYMENT_DAYS = :d, CREDIT_LIMIT_MDL = :l, UPDATED_BY = :usr, UPDATED_AT = SYSDATE
      WHEN NOT MATCHED THEN INSERT (CUSTOMER_ID, PAYMENT_DAYS, CREDIT_LIMIT_MDL, UPDATED_BY) VALUES (:c, :d, :l, :usr)`,
      { c: customerId, d: days, l: limit, usr: user });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ACTION, CHANGED_BY, NEW_VALUES)
                VALUES ('customer_terms', :c, 'update', :usr, :new)`,
      { c: customerId, usr: user, new: JSON.stringify({ payment_days: days, credit_limit_mdl: limit }) });
    return { customer_id: customerId };
  });
}

export async function saveDefaultDays(days: number, user: string, dryRun = false) {
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new PayError("Отсрочка — от 0 до 3650 дней");
  return tx(dryRun, async exec => {
    await exec(`
      MERGE INTO AGRO_MODULE_CONFIG t USING (SELECT 'CRM_DEFAULT_PAYMENT_DAYS' AS K FROM DUAL) s ON (t.CONFIG_KEY = s.K)
      WHEN MATCHED THEN UPDATE SET CONFIG_VALUE = :v
      WHEN NOT MATCHED THEN INSERT (CONFIG_KEY, CONFIG_VALUE, CONFIG_GROUP, DESCRIPTION)
                            VALUES ('CRM_DEFAULT_PAYMENT_DAYS', :v, 'finance', 'Default customer payment term, days (CRM)')`,
      { v: String(days) });
    await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ACTION, CHANGED_BY, NEW_VALUES)
                VALUES ('payment_terms_default', 0, 'update', :usr, :new)`, { usr: user, new: JSON.stringify({ days }) });
    return { days };
  });
}

// ── Reconciliation statement (акт сверки) ────────────────────────────────
export async function reconciliation(customerId: number, currency: string, from: string, to: string) {
  const l = await loadLedger(customerId);
  const start = new Date(`${from}T00:00:00`), end = new Date(new Date(`${to}T00:00:00`).getTime() + DAY);
  type Mv = { date: Date; kind: "sale" | "return" | "payment"; number: string; debit: number; credit: number };
  const moves: Mv[] = [];
  for (const d of l.docRows.filter(d => s(d.CUR) === currency)) {
    moves.push({ date: d.DOC_DATE as Date, kind: "sale", number: s(d.NUM), debit: n(d.TOTAL), credit: 0 });
  }
  const rets = await query<Row>(`
    SELECT r.RETURN_NUMBER, r.RETURN_DATE, NVL(SUM(rl.AMOUNT), 0) AS AMT
    FROM AGRO_SALES_RETURNS r JOIN AGRO_SALES_RETURN_LINES rl ON rl.RETURN_ID = r.ID
    JOIN AGRO_SALES_DOCS sd ON sd.ID = r.SALES_DOC_ID
    WHERE NVL(r.STATUS, 'active') <> 'cancelled' AND sd.CUSTOMER_ID = :c AND NVL(sd.CURRENCY_CODE, 'MDL') = :cur
    GROUP BY r.RETURN_NUMBER, r.RETURN_DATE`, { c: customerId, cur: currency });
  for (const r of rets) moves.push({ date: r.RETURN_DATE as Date, kind: "return", number: s(r.RETURN_NUMBER), debit: 0, credit: n(r.AMT) });
  for (const p of l.pays.filter(p => p.status === "active" && p.currency === currency)) {
    moves.push({ date: p.date, kind: "payment", number: p.number + (p.reference ? ` (${p.reference})` : ""), debit: 0, credit: p.amount });
  }
  moves.sort((a, b) => a.date.getTime() - b.date.getTime());
  const before = moves.filter(m => m.date < start), inside = moves.filter(m => m.date >= start && m.date < end);
  const opening = r2(before.reduce((a, m) => a + m.debit - m.credit, 0));
  let bal = opening;
  const rows = inside.map(m => { bal = r2(bal + m.debit - m.credit); return { date: m.date.toISOString(), kind: m.kind, number: m.number, debit: r2(m.debit), credit: r2(m.credit), balance: bal }; });
  const cust = await query<Row>(`SELECT NAME, TAX_ID, ADDRESS FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]);
  return {
    customer_name: s(cust[0]?.NAME), customer_tax_id: s(cust[0]?.TAX_ID), customer_address: s(cust[0]?.ADDRESS),
    currency, date_from: from, date_to: to, opening, rows,
    turnover_debit: r2(rows.reduce((a, r) => a + r.debit, 0)), turnover_credit: r2(rows.reduce((a, r) => a + r.credit, 0)),
    closing: rows.length ? rows[rows.length - 1].balance : opening,
  };
}
