// Commercial offers (AGRO_CRM_QUOTES / _LINES) — CRM-only. A quote is
// addressed to a customer and/or a deal (a lead in AGRO_CRM_LEADS, the CRM
// pipeline) and moves the deal along: sent → "proposal", accepted → "won",
// rejected → "lost". Nothing here writes to DIPP FRUICT tables; sales
// documents are only read for price hints. Changes go to the audit log ('quote').
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";
import { tx } from "@/lib/receivables";

type Row = Record<string, unknown>;
type Exec = (sql: string, b: Record<string, unknown>) => Promise<Row[]>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
// Same list as /api/leads/[id] accepts.
export const LOSS_REASONS = ["price", "competitor", "no_budget", "no_contact", "timing", "other"] as const;
const NEXT: Record<string, string[]> = {
  draft: ["sent"], sent: ["accepted", "rejected", "draft"], accepted: ["sent"], rejected: ["sent"],
};
const EDITABLE = ["draft", "sent"];
// Deal stage a quote status implies; earlier stages are moved forward only.
const LEAD_STAGE: Record<string, string> = { draft: "qualified", sent: "proposal", accepted: "won", rejected: "lost" };
const LEAD_RANK: Record<string, number> = { new: 0, contacted: 1, qualified: 2, proposal: 3, won: 4, lost: 4 };

export class QuoteError extends Error {}

async function audit(exec: Exec, id: number, name: string, action: string, user: string, changes: unknown) {
  await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, NEW_VALUES)
              VALUES ('quote', :id, :name, :act, :usr, :new)`,
    { id, name: name.slice(0, 200), act: action, usr: user, new: JSON.stringify(changes) });
}

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// ── Lists ────────────────────────────────────────────────────────────────

export async function listQuotes(sp: URLSearchParams) {
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "", st = sp.get("status") ?? "";
  if (ISO.test(df)) { w.push("q.QUOTE_DATE >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("q.QUOTE_DATE < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  if (st === "expired") w.push("q.STATUS = 'sent' AND q.VALID_UNTIL < TRUNC(SYSDATE)");
  else if (st === "open") w.push("q.STATUS IN ('draft', 'sent')");
  else if ((QUOTE_STATUSES as readonly string[]).includes(st)) { w.push("q.STATUS = :st"); b.st = st; }
  const cust = Number(sp.get("customer_id"));
  if (cust > 0) { w.push("q.CUSTOMER_ID = :cust"); b.cust = cust; }
  const lead = Number(sp.get("lead_id"));
  if (lead > 0) { w.push("q.LEAD_ID = :lead"); b.lead = lead; }
  const mgr = (sp.get("manager") ?? "").trim();
  if (mgr) { w.push("q.MANAGER = :mgr"); b.mgr = mgr; }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) { w.push("(UPPER(q.QUOTE_NUMBER) LIKE :q OR UPPER(q.CLIENT_NAME) LIKE :q OR UPPER(q.CONTACT_PERSON) LIKE :q OR UPPER(q.NOTES) LIKE :q)"); b.q = `%${q.toUpperCase()}%`; }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT q.ID, q.QUOTE_NUMBER, q.QUOTE_DATE, q.VALID_UNTIL, q.CUSTOMER_ID, q.LEAD_ID, q.CLIENT_NAME, q.CURRENCY_CODE,
             q.TOTAL, q.STATUS, q.MANAGER, q.SENT_AT, q.DECIDED_AT, l.NAME AS LEAD_NAME, l.STATUS AS LEAD_STATUS,
             (SELECT COUNT(*) FROM AGRO_CRM_QUOTE_LINES x WHERE x.QUOTE_ID = q.ID) AS LINES,
             (SELECT NVL(SUM(x.QTY_KG), 0) FROM AGRO_CRM_QUOTE_LINES x WHERE x.QUOTE_ID = q.ID) AS QTY_KG
      FROM AGRO_CRM_QUOTES q
      LEFT JOIN AGRO_CRM_LEADS l ON l.ID = q.LEAD_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY q.QUOTE_DATE DESC, q.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  const t0 = today();
  const list = rows.map(r => {
    const status = s(r.STATUS);
    const valid = r.VALID_UNTIL instanceof Date ? r.VALID_UNTIL : null;
    return {
      id: n(r.ID), number: s(r.QUOTE_NUMBER), date: iso(r.QUOTE_DATE), valid_until: iso(r.VALID_UNTIL),
      customer_id: nn(r.CUSTOMER_ID), lead_id: nn(r.LEAD_ID), lead_name: s(r.LEAD_NAME), lead_status: s(r.LEAD_STATUS),
      client_name: s(r.CLIENT_NAME), currency: s(r.CURRENCY_CODE), total: n(r.TOTAL), status,
      expired: status === "sent" && !!valid && valid < t0, manager: s(r.MANAGER),
      sent_at: iso(r.SENT_AT), decided_at: iso(r.DECIDED_AT), lines: n(r.LINES), qty_kg: n(r.QTY_KG),
    };
  });
  const cnt = (k: string) => list.filter(r => r.status === k).length;
  const decided = cnt("accepted") + cnt("rejected");
  // Open/won amounts per currency — quotes are in different currencies.
  const sum = (pred: (r: (typeof list)[number]) => boolean) => {
    const m: Record<string, number> = {};
    for (const r of list.filter(pred)) m[r.currency] = r2((m[r.currency] ?? 0) + r.total);
    return m;
  };
  return {
    rows: list,
    totals: {
      count: list.length, draft: cnt("draft"), sent: cnt("sent"), accepted: cnt("accepted"), rejected: cnt("rejected"),
      expired: list.filter(r => r.expired).length, win_rate: decided ? Math.round((cnt("accepted") / decided) * 100) : null,
      open_amount: sum(r => r.status === "sent" && !r.expired), won_amount: sum(r => r.status === "accepted"),
    },
  };
}

export async function quoteDetail(id: number, lang: Lang = "ru") {
  const [hdr, lines, hist] = await Promise.all([
    query<Row>(`
      SELECT q.*, l.NAME AS LEAD_NAME, l.STATUS AS LEAD_STATUS, l.PHONE AS LEAD_PHONE, l.EMAIL AS LEAD_EMAIL,
             c.NAME AS CUSTOMER_NAME, c.ADDRESS AS CUSTOMER_ADDRESS, c.TAX_ID AS CUSTOMER_TAX_ID,
             c.CONTACT_PHONE AS CUSTOMER_PHONE, c.CONTACT_EMAIL AS CUSTOMER_EMAIL, c.COUNTRY AS CUSTOMER_COUNTRY,
             NVL(u.FULL_NAME, TRIM(u.FIRST_NAME || ' ' || u.LAST_NAME)) AS MANAGER_NAME
      FROM AGRO_CRM_QUOTES q
      LEFT JOIN AGRO_CRM_LEADS l ON l.ID = q.LEAD_ID
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = q.CUSTOMER_ID
      LEFT JOIN AGRO_USERS u ON u.USERNAME = q.MANAGER
      WHERE q.ID = :1`, [id]),
    query<Row>(`
      SELECT x.ID, x.LINE_ORDER, x.ITEM_ID, x.DESCRIPTION, x.PACKAGING, x.QTY_KG, x.PRICE_PER_KG, x.AMOUNT,
             i.CODE AS ITEM_CODE, i.NAME_RO, i.NAME_RU
      FROM AGRO_CRM_QUOTE_LINES x LEFT JOIN AGRO_ITEMS i ON i.ID = x.ITEM_ID
      WHERE x.QUOTE_ID = :1 ORDER BY x.LINE_ORDER, x.ID`, [id]),
    query<Row>(`SELECT ACTION, CHANGED_BY, CHANGED_AT, NEW_VALUES FROM AGRO_CRM_AUDIT_LOG
                WHERE ENTITY_TYPE = 'quote' AND ENTITY_ID = :1 ORDER BY CHANGED_AT DESC, ID DESC`, [id]),
  ]);
  if (!hdr.length) return null;
  const h = hdr[0];
  const status = s(h.STATUS);
  const valid = h.VALID_UNTIL instanceof Date ? h.VALID_UNTIL : null;
  return {
    id: n(h.ID), number: s(h.QUOTE_NUMBER), date: iso(h.QUOTE_DATE), valid_until: iso(h.VALID_UNTIL),
    customer_id: nn(h.CUSTOMER_ID), customer_name: s(h.CUSTOMER_NAME), customer_address: s(h.CUSTOMER_ADDRESS),
    customer_tax_id: s(h.CUSTOMER_TAX_ID), customer_country: s(h.CUSTOMER_COUNTRY),
    lead_id: nn(h.LEAD_ID), lead_name: s(h.LEAD_NAME), lead_status: s(h.LEAD_STATUS),
    client_name: s(h.CLIENT_NAME), contact_person: s(h.CONTACT_PERSON),
    phone: s(h.CUSTOMER_PHONE) || s(h.LEAD_PHONE), email: s(h.CUSTOMER_EMAIL) || s(h.LEAD_EMAIL),
    currency: s(h.CURRENCY_CODE), delivery_terms: s(h.DELIVERY_TERMS), payment_terms: s(h.PAYMENT_TERMS),
    notes: s(h.NOTES), internal_notes: s(h.INTERNAL_NOTES), discount_pct: n(h.DISCOUNT_PCT),
    subtotal: n(h.SUBTOTAL), discount_amount: n(h.DISCOUNT_AMOUNT), total: n(h.TOTAL),
    status, expired: status === "sent" && !!valid && valid < today(), next: NEXT[status] ?? [], editable: EDITABLE.includes(status),
    manager: s(h.MANAGER), manager_name: s(h.MANAGER_NAME) || s(h.MANAGER),
    sent_at: iso(h.SENT_AT), decided_at: iso(h.DECIDED_AT), reject_reason: s(h.REJECT_REASON),
    created_by: s(h.CREATED_BY), created_at: iso(h.CREATED_AT),
    lines: lines.map(x => ({
      id: n(x.ID), item_id: nn(x.ITEM_ID), item_code: s(x.ITEM_CODE), item_name: x.ITEM_ID ? pickName(lang, x.NAME_RO, x.NAME_RU) : "",
      description: s(x.DESCRIPTION), packaging: s(x.PACKAGING),
      qty_kg: n(x.QTY_KG), price_per_kg: n(x.PRICE_PER_KG), amount: n(x.AMOUNT),
    })),
    history: hist.map(r => {
      let changes: Record<string, unknown> = {};
      try { changes = JSON.parse(s(r.NEW_VALUES)) ?? {}; } catch { /* foreign row */ }
      return { action: s(r.ACTION), by: s(r.CHANGED_BY), at: iso(r.CHANGED_AT), changes };
    }),
  };
}
export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof quoteDetail>>>;

// Pickers for the form: customers, open deals, items, staff.
export async function quoteLookups(lang: Lang) {
  const [cust, leads, items, users] = await Promise.all([
    query<Row>(`SELECT ID, NAME, COUNTRY FROM AGRO_CUSTOMERS WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY NAME`, []),
    query<Row>(`SELECT ID, NAME, COMPANY, STATUS, CUSTOMER_ID, ASSIGNED_TO FROM AGRO_CRM_LEADS
                WHERE STATUS NOT IN ('won', 'lost') ORDER BY NVL(UPDATED_AT, CREATED_AT) DESC`, []),
    query<Row>(`SELECT ID, CODE, NAME_RO, NAME_RU FROM AGRO_ITEMS WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY NAME_RO`, []),
    query<Row>(`SELECT USERNAME, NVL(FULL_NAME, TRIM(FIRST_NAME || ' ' || LAST_NAME)) AS NM FROM AGRO_USERS
                WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY USERNAME`, []),
  ]);
  return {
    customers: cust.map(c => ({ id: n(c.ID), name: s(c.NAME), country: s(c.COUNTRY) })),
    leads: leads.map(l => ({ id: n(l.ID), name: s(l.NAME), company: s(l.COMPANY), status: s(l.STATUS), customer_id: nn(l.CUSTOMER_ID), assigned_to: s(l.ASSIGNED_TO) })),
    items: items.map(i => ({ id: n(i.ID), code: s(i.CODE), name: pickName(lang, i.NAME_RO, i.NAME_RU) })),
    users: users.map(u => ({ username: s(u.USERNAME), name: s(u.NM) || s(u.USERNAME) })),
  };
}

// Price hints per item in the quote currency, from DIPP FRUICT sales: the
// last price this customer paid and the last price anybody paid.
export async function priceHints(customerId: number | null, currency: string) {
  const rows = await query<Row>(`
    SELECT ITEM_ID, SCOPE, PRICE, DOC_DATE FROM (
      SELECT sl.ITEM_ID, CASE WHEN sd.CUSTOMER_ID = :cust THEN 'customer' ELSE 'any' END AS SCOPE,
             sl.PRICE_PER_KG AS PRICE, sd.DOC_DATE,
             ROW_NUMBER() OVER (PARTITION BY sl.ITEM_ID, CASE WHEN sd.CUSTOMER_ID = :cust THEN 'customer' ELSE 'any' END
                                ORDER BY sd.DOC_DATE DESC, sd.ID DESC) AS RN
      FROM AGRO_SALES_LINES sl JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
      WHERE NVL(sd.CURRENCY_CODE, 'MDL') = :cur AND sd.STATUS <> 'draft' AND sl.PRICE_PER_KG > 0
    ) WHERE RN = 1`, { cust: customerId ?? -1, cur: currency });
  const out: Record<number, { customer?: { price: number; date: string | null }; any?: { price: number; date: string | null } }> = {};
  for (const r of rows) {
    const e = (out[n(r.ITEM_ID)] ??= {});
    const v = { price: n(r.PRICE), date: iso(r.DOC_DATE) };
    if (s(r.SCOPE) === "customer") e.customer = v;
    if (!e.any || (v.date ?? "") > (e.any.date ?? "")) e.any = v;
  }
  return out;
}

// ── Writes ───────────────────────────────────────────────────────────────

export interface QuoteInput {
  quote_date: string; valid_until: string | null; customer_id: number | null; lead_id: number | null;
  client_name: string; contact_person: string | null; currency: string; delivery_terms: string | null;
  payment_terms: string | null; notes: string | null; internal_notes: string | null; discount_pct: number;
  manager: string | null;
  lines: { item_id: number | null; description: string; packaging: string | null; qty_kg: number; price_per_kg: number }[];
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
function num(v: unknown, label: string, max = 1e11) {
  const x = Number(String(v ?? "").replace(",", ".").trim());
  if (!Number.isFinite(x) || x < 0 || x > max) throw new QuoteError(`${label}: неверное число`);
  return x;
}

export function parseQuote(b: Record<string, unknown>): QuoteInput {
  const date = String(b.quote_date ?? "");
  if (!ISO.test(date)) throw new QuoteError("Укажите дату КП");
  const valid = String(b.valid_until ?? "").trim();
  if (valid && !ISO.test(valid)) throw new QuoteError("Неверный срок действия");
  if (valid && valid < date) throw new QuoteError("Срок действия раньше даты КП");
  const cust = Number(b.customer_id), lead = Number(b.lead_id);
  const client = text(b.client_name, 300);
  if (!(cust > 0) && !(lead > 0) && !client) throw new QuoteError("Выберите клиента или сделку");
  const currency = String(b.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new QuoteError("Неверная валюта");
  const disc = b.discount_pct == null || String(b.discount_pct).trim() === "" ? 0 : num(b.discount_pct, "Скидка", 100);
  const raw = Array.isArray(b.lines) ? b.lines : [];
  const lines = raw.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const item = Number(o.item_id);
    const description = text(o.description, 300);
    if (!description) throw new QuoteError(`Строка ${i + 1}: укажите товар`);
    const qty = num(o.qty_kg, `Строка ${i + 1}, количество`);
    if (!(qty > 0)) throw new QuoteError(`Строка ${i + 1}: количество должно быть больше нуля`);
    return {
      item_id: item > 0 ? item : null, description, packaging: text(o.packaging, 200),
      qty_kg: Math.round(qty * 1000) / 1000, price_per_kg: Math.round(num(o.price_per_kg, `Строка ${i + 1}, цена`) * 10000) / 10000,
    };
  });
  if (!lines.length) throw new QuoteError("Добавьте хотя бы одну строку");
  if (lines.length > 100) throw new QuoteError("Слишком много строк");
  return {
    quote_date: date, valid_until: valid || null, customer_id: cust > 0 ? cust : null, lead_id: lead > 0 ? lead : null,
    client_name: client ?? "", contact_person: text(b.contact_person, 200), currency,
    delivery_terms: text(b.delivery_terms, 300), payment_terms: text(b.payment_terms, 300),
    notes: text(b.notes, 2000), internal_notes: text(b.internal_notes, 1000),
    discount_pct: Math.round(disc * 100) / 100, manager: text(b.manager, 100), lines,
  };
}

function totals(p: QuoteInput) {
  const subtotal = r2(p.lines.reduce((a, x) => a + r2(x.qty_kg * x.price_per_kg), 0));
  const discount = r2(subtotal * p.discount_pct / 100);
  return { subtotal, discount, total: r2(subtotal - discount) };
}

// Fills CLIENT_NAME from the customer / deal when it was left empty and
// checks every reference exists.
async function resolve(p: QuoteInput): Promise<QuoteInput> {
  let client = p.client_name;
  if (p.customer_id) {
    const c = await query<Row>(`SELECT NAME FROM AGRO_CUSTOMERS WHERE ID = :1`, [p.customer_id]);
    if (!c.length) throw new QuoteError("Клиент не найден");
    client ||= s(c[0].NAME);
  }
  if (p.lead_id) {
    const l = await query<Row>(`SELECT NAME, COMPANY, CUSTOMER_ID FROM AGRO_CRM_LEADS WHERE ID = :1`, [p.lead_id]);
    if (!l.length) throw new QuoteError("Сделка не найдена");
    if (p.customer_id && l[0].CUSTOMER_ID && n(l[0].CUSTOMER_ID) !== p.customer_id) throw new QuoteError("Сделка привязана к другому клиенту");
    client ||= s(l[0].COMPANY) || s(l[0].NAME);
  }
  const itemIds = [...new Set(p.lines.map(x => x.item_id).filter((x): x is number => !!x))];
  if (itemIds.length) {
    const found = await query<Row>(`SELECT ID FROM AGRO_ITEMS WHERE ID IN (${itemIds.map((_, i) => `:i${i}`).join(",")})`,
      Object.fromEntries(itemIds.map((v, i) => [`i${i}`, v])));
    if (found.length !== itemIds.length) throw new QuoteError("Товар не найден");
  }
  if (p.manager) {
    const u = await query<Row>(`SELECT 1 AS X FROM AGRO_USERS WHERE USERNAME = :1`, [p.manager]);
    if (!u.length) throw new QuoteError("Менеджер не найден");
  }
  return { ...p, client_name: client.slice(0, 300) };
}

async function writeLines(exec: Exec, quoteId: number, lines: QuoteInput["lines"]) {
  await exec(`DELETE FROM AGRO_CRM_QUOTE_LINES WHERE QUOTE_ID = :id`, { id: quoteId });
  let i = 0;
  for (const x of lines) {
    i += 1;
    await exec(`INSERT INTO AGRO_CRM_QUOTE_LINES (QUOTE_ID, LINE_ORDER, ITEM_ID, DESCRIPTION, PACKAGING, QTY_KG, PRICE_PER_KG, AMOUNT)
                VALUES (:q, :o, :item, :d, :pk, :qty, :price, :amt)`,
      { q: quoteId, o: i, item: x.item_id, d: x.description, pk: x.packaging, qty: x.qty_kg, price: x.price_per_kg, amt: r2(x.qty_kg * x.price_per_kg) });
  }
}

// Moves the linked deal to the stage the quote implies — forward only, and
// a won/lost deal is touched only by an accept/reject decision.
async function syncLead(exec: Exec, leadId: number | null, quoteStatus: string, lossReason: string | null) {
  if (!leadId) return null;
  const rows = await exec(`SELECT STATUS FROM AGRO_CRM_LEADS WHERE ID = :id`, { id: leadId });
  if (!rows.length) return null;
  const cur = s(rows[0].STATUS);
  const target = LEAD_STAGE[quoteStatus];
  const decision = quoteStatus === "accepted" || quoteStatus === "rejected";
  if (!target || cur === target) return null;
  if (!decision && (LEAD_RANK[cur] ?? 0) >= (LEAD_RANK[target] ?? 0)) return null;
  if (decision && cur === "won" && target === "lost") return null; // another quote already won it
  await exec(`UPDATE AGRO_CRM_LEADS SET STATUS = :st, LOSS_REASON = :lr, UPDATED_AT = SYSTIMESTAMP WHERE ID = :id`,
    { id: leadId, st: target, lr: target === "lost" ? lossReason ?? "other" : null });
  return { from: cur, to: target };
}

export async function createQuote(input: QuoteInput, user: string, dryRun = false) {
  const p = await resolve(input);
  const t = totals(p);
  return tx(dryRun, async exec => {
    const id = n((await exec(`SELECT AGRO_CRM_QUOTES_SEQ.NEXTVAL AS V FROM DUAL`, {}))[0].V);
    const number = `QT-${p.quote_date.replace(/-/g, "")}-${String(id).padStart(4, "0")}`;
    await exec(`
      INSERT INTO AGRO_CRM_QUOTES (ID, QUOTE_NUMBER, QUOTE_DATE, VALID_UNTIL, CUSTOMER_ID, LEAD_ID, CLIENT_NAME, CONTACT_PERSON,
                                   CURRENCY_CODE, DELIVERY_TERMS, PAYMENT_TERMS, NOTES, INTERNAL_NOTES, DISCOUNT_PCT, SUBTOTAL,
                                   DISCOUNT_AMOUNT, TOTAL, STATUS, MANAGER, CREATED_BY)
      VALUES (:id, :num, TO_DATE(:d, 'YYYY-MM-DD'), TO_DATE(:vu, 'YYYY-MM-DD'), :cust, :lead, :client, :contact, :cur, :dt, :pt,
              :notes, :inotes, :disc, :sub, :damt, :total, 'draft', :mgr, :usr)`,
      { id, num: number, d: p.quote_date, vu: p.valid_until, cust: p.customer_id, lead: p.lead_id, client: p.client_name,
        contact: p.contact_person, cur: p.currency, dt: p.delivery_terms, pt: p.payment_terms, notes: p.notes,
        inotes: p.internal_notes, disc: p.discount_pct, sub: t.subtotal, damt: t.discount, total: t.total, mgr: p.manager ?? user, usr: user });
    await writeLines(exec, id, p.lines);
    const lead = await syncLead(exec, p.lead_id, "draft", null);
    await audit(exec, id, `${number} · ${p.client_name}`, "create", user, { ...p, ...t, lead });
    return { id, number };
  });
}

export async function updateQuote(id: number, b: Record<string, unknown>, user: string, dryRun = false) {
  const cur = await quoteDetail(id);
  if (!cur) throw new QuoteError("КП не найдено");
  if (!cur.editable) throw new QuoteError("Принятое или отклонённое КП не редактируется — верните его в «Отправлено»");
  const p = await resolve(parseQuote(b));
  const t = totals(p);
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_QUOTES SET QUOTE_DATE = TO_DATE(:d, 'YYYY-MM-DD'), VALID_UNTIL = TO_DATE(:vu, 'YYYY-MM-DD'), CUSTOMER_ID = :cust,
             LEAD_ID = :lead, CLIENT_NAME = :client, CONTACT_PERSON = :contact, CURRENCY_CODE = :cur, DELIVERY_TERMS = :dt,
             PAYMENT_TERMS = :pt, NOTES = :notes, INTERNAL_NOTES = :inotes, DISCOUNT_PCT = :disc, SUBTOTAL = :sub,
             DISCOUNT_AMOUNT = :damt, TOTAL = :total, MANAGER = :mgr, UPDATED_AT = SYSDATE
      WHERE ID = :id`,
      { id, d: p.quote_date, vu: p.valid_until, cust: p.customer_id, lead: p.lead_id, client: p.client_name,
        contact: p.contact_person, cur: p.currency, dt: p.delivery_terms, pt: p.payment_terms, notes: p.notes,
        inotes: p.internal_notes, disc: p.discount_pct, sub: t.subtotal, damt: t.discount, total: t.total, mgr: p.manager ?? cur.manager ?? user });
    await writeLines(exec, id, p.lines);
    const lead = p.lead_id !== cur.lead_id ? await syncLead(exec, p.lead_id, cur.status, null) : null;
    await audit(exec, id, `${cur.number} · ${p.client_name}`, "update", user, { ...p, ...t, lead });
    return { id };
  });
}

export async function setQuoteStatus(id: number, b: Record<string, unknown>, user: string, dryRun = false) {
  const cur = await quoteDetail(id);
  if (!cur) throw new QuoteError("КП не найдено");
  const status = String(b.status ?? "");
  if (!(cur.next).includes(status)) throw new QuoteError("Такой переход статуса невозможен");
  let reason: string | null = null, loss: string | null = null;
  if (status === "rejected") {
    reason = text(b.reject_reason, 500);
    if (!reason) throw new QuoteError("Укажите причину отказа");
    const lr = String(b.loss_reason ?? "other");
    loss = (LOSS_REASONS as readonly string[]).includes(lr) ? lr : "other";
  }
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_QUOTES SET STATUS = :st, UPDATED_AT = SYSDATE,
             SENT_AT = CASE WHEN :st = 'sent' THEN NVL(SENT_AT, SYSDATE) WHEN :st = 'draft' THEN NULL ELSE SENT_AT END,
             DECIDED_AT = CASE WHEN :st IN ('accepted', 'rejected') THEN SYSDATE ELSE NULL END,
             REJECT_REASON = CASE WHEN :st = 'rejected' THEN :reason ELSE NULL END
      WHERE ID = :id`, { id, st: status, reason });
    const lead = await syncLead(exec, cur.lead_id, status, loss);
    await audit(exec, id, `${cur.number} · ${cur.client_name}`, "status", user, { from: cur.status, status, reject_reason: reason, lead });
    return { id, status, lead };
  });
}

// "Turn the quote into a deal": creates a lead in the default pipeline at the
// stage matching the quote and links it to the quote.
export async function createDealFromQuote(id: number, user: string, dryRun = false) {
  const cur = await quoteDetail(id);
  if (!cur) throw new QuoteError("КП не найдено");
  if (cur.lead_id) throw new QuoteError("У этого КП уже есть сделка");
  return tx(dryRun, async exec => {
    const pipe = await exec(`SELECT ID FROM (SELECT ID FROM AGRO_CRM_PIPELINES ORDER BY IS_DEFAULT DESC, ID) WHERE ROWNUM = 1`, {});
    const newId = n((await exec(`SELECT AGRO_CRM_LEADS_SEQ.NEXTVAL AS V FROM DUAL`, {}))[0].V);
    await exec(`
      INSERT INTO AGRO_CRM_LEADS (ID, NAME, COMPANY, PHONE, EMAIL, SOURCE, STATUS, NOTES, ASSIGNED_TO, CUSTOMER_ID, CREATED_BY, PIPELINE_ID, LOSS_REASON)
      VALUES (:lid, :name, :company, :phone, :email, 'other', :st, :notes, :mgr, :cust, :usr, :pipe, :lr)`,
      { lid: newId, name: (cur.contact_person || cur.client_name).slice(0, 200), company: cur.client_name.slice(0, 200),
        phone: cur.phone || null, email: cur.email || null, st: LEAD_STAGE[cur.status] ?? "proposal",
        notes: `КП ${cur.number}`, mgr: cur.manager || user, cust: cur.customer_id, usr: user,
        pipe: pipe.length ? n(pipe[0].ID) : null, lr: cur.status === "rejected" ? "other" : null });
    await exec(`UPDATE AGRO_CRM_QUOTES SET LEAD_ID = :lead, UPDATED_AT = SYSDATE WHERE ID = :id`, { id, lead: newId });
    await audit(exec, id, `${cur.number} · ${cur.client_name}`, "deal", user, { lead_id: newId });
    return { id, lead_id: newId };
  });
}

// New draft with the same addressee, terms and lines, dated today.
export async function duplicateQuote(id: number, user: string, dryRun = false) {
  const cur = await quoteDetail(id);
  if (!cur) throw new QuoteError("КП не найдено");
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = cur.valid_until && cur.date ? Math.round((Date.parse(cur.valid_until) - Date.parse(cur.date)) / 86400000) : null;
  const valid = days != null && days >= 0 ? new Date(d.getTime() + days * 86400000) : null;
  return createQuote(parseQuote({
    quote_date: date, valid_until: valid ? `${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, "0")}-${String(valid.getDate()).padStart(2, "0")}` : "",
    customer_id: cur.customer_id, lead_id: cur.lead_status === "won" || cur.lead_status === "lost" ? null : cur.lead_id,
    client_name: cur.client_name, contact_person: cur.contact_person, currency: cur.currency,
    delivery_terms: cur.delivery_terms, payment_terms: cur.payment_terms, notes: cur.notes, internal_notes: cur.internal_notes,
    discount_pct: cur.discount_pct, manager: cur.manager,
    lines: cur.lines.map(x => ({ item_id: x.item_id, description: x.description, packaging: x.packaging, qty_kg: x.qty_kg, price_per_kg: x.price_per_kg })),
  }), user, dryRun);
}
