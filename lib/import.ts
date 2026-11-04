// Excel / CSV import of customers, leads and customer payments.
// Flow: parse → the user maps columns (we suggest a mapping from header
// aliases) → run() with dryRun=true checks every row against the live DB
// inside a transaction that is rolled back → run() for real commits the
// valid rows in one transaction and writes AGRO_CRM_IMPORT_LOG.
// Rows that already exist are skipped, never overwritten.
import ExcelJS from "exceljs";
import oracledb from "oracledb";
import { query, execute, getConnection } from "@/lib/oracle";
import { rateOn } from "@/lib/rates";
import { METHODS, insertPayment, cancelPayment, type NewPayment } from "@/lib/receivables";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";

const DICTS = { ru, ro, en } as const;
export type ImportLang = keyof typeof DICTS;
// Column titles used in the downloadable template (imp.<entity>_<field>);
// they also count as aliases, so a filled-in template maps itself.
export function fieldLabel(lang: ImportLang, entity: Entity, key: string): string {
  return ((DICTS[lang] as unknown as { imp?: Record<string, string> }).imp?.[`${entity}_${key}`]) ?? key;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

export const ENTITIES = ["customers", "leads", "payments"] as const;
export type Entity = (typeof ENTITIES)[number];
export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

export class ImportError extends Error {}

interface Field { key: string; required?: boolean; aliases: string[] }

// Aliases are compared case- and diacritics-insensitively (RU / RO / EN headers).
export const FIELDS: Record<Entity, Field[]> = {
  customers: [
    { key: "name", required: true, aliases: ["name", "название", "наименование", "клиент", "компания", "denumire", "denumirea", "client", "company", "customer"] },
    { key: "code", aliases: ["code", "код", "cod"] },
    { key: "tax_id", aliases: ["tax_id", "idno", "фискальный код", "фиск. код", "инн", "cod fiscal", "cod fiscal/idno", "tax id", "vat"] },
    { key: "country", aliases: ["country", "страна", "tara", "țara"] },
    { key: "phone", aliases: ["phone", "телефон", "тел", "telefon"] },
    { key: "email", aliases: ["email", "e-mail", "почта", "эл. почта"] },
    { key: "address", aliases: ["address", "адрес", "adresa", "adresă"] },
    { key: "customer_type", aliases: ["customer_type", "type", "тип", "tip", "тип клиента"] },
  ],
  leads: [
    { key: "name", required: true, aliases: ["name", "имя", "контакт", "контактное лицо", "nume", "persoana de contact", "contact"] },
    { key: "company", aliases: ["company", "компания", "организация", "companie", "firma"] },
    { key: "phone", aliases: ["phone", "телефон", "тел", "telefon"] },
    { key: "email", aliases: ["email", "e-mail", "почта", "эл. почта"] },
    { key: "source", aliases: ["source", "источник", "sursa", "sursă"] },
    { key: "notes", aliases: ["notes", "комментарий", "заметки", "примечание", "comentariu", "note", "comment"] },
  ],
  payments: [
    { key: "customer", required: true, aliases: ["customer", "клиент", "плательщик", "контрагент", "client", "platitor", "plătitor", "payer", "код клиента", "idno", "фискальный код", "cod fiscal"] },
    { key: "pay_date", required: true, aliases: ["date", "дата", "дата оплаты", "data", "data platii", "data plății", "pay_date", "payment date"] },
    { key: "amount", required: true, aliases: ["amount", "сумма", "suma", "sumă", "сумма оплаты", "кредит", "credit"] },
    { key: "currency", aliases: ["currency", "валюта", "valuta", "valută"] },
    { key: "document", aliases: ["document", "документ", "накладная", "счет", "счёт", "invoice", "factura", "factură", "№ документа", "номер документа"] },
    { key: "method", aliases: ["method", "способ", "способ оплаты", "metoda", "metodă"] },
    { key: "reference", aliases: ["reference", "назначение", "назначение платежа", "№ п/п", "п/п", "destinatie", "destinație", "nr op", "ref"] },
    { key: "notes", aliases: ["notes", "комментарий", "примечание", "comentariu", "comment"] },
  ],
};

// Module whose "edit" right the import needs.
export const ENTITY_MODULE = { customers: "customers", leads: "leads", payments: "payments" } as const;

export function isEntity(v: unknown): v is Entity {
  return typeof v === "string" && (ENTITIES as readonly string[]).includes(v);
}

// ── Parsing ──────────────────────────────────────────────────────────────
// lines[i] is the file line number of rows[i] (blank lines are dropped).
export interface Sheet { headers: string[]; rows: string[][]; lines: number[] }

const pad = (x: number) => String(x).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return isoOf(v);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map(r => r.text).join("");
    if ("text" in v) return s(v.text);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : first.includes("\t") && !first.includes(",") ? "\t" : ",";
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur.trim()); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim()); out.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur.trim()); out.push(row); }
  return out;
}

export async function parseFile(buf: Buffer, filename: string): Promise<Sheet> {
  if (buf.length > MAX_BYTES) throw new ImportError("Файл больше 5 МБ");
  let raw: { line: number; vals: string[] }[];
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) {
    let text = buf.toString("utf8");
    if (text.includes("�")) text = new TextDecoder("windows-1251").decode(buf);
    raw = parseCsv(text.replace(/^﻿/, "")).map((vals, i) => ({ line: i + 1, vals }));
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new ImportError("Не удалось прочитать файл Excel (нужен .xlsx)"); }
    const ws = wb.worksheets.find(w => w.actualRowCount > 0);
    if (!ws) throw new ImportError("В файле нет данных");
    raw = [];
    ws.eachRow({ includeEmpty: false }, r => {
      const vals: string[] = [];
      for (let c = 1; c <= r.cellCount; c++) vals.push(cellText(r.getCell(c).value));
      raw.push({ line: r.number, vals });
    });
  } else throw new ImportError("Поддерживаются файлы .xlsx и .csv");
  raw = raw.filter(r => r.vals.some(v => v !== ""));
  if (raw.length < 2) throw new ImportError("В файле нет строк с данными (первая строка — заголовки)");
  const headers = raw[0].vals.map(h => h.trim());
  const rows = raw.slice(1).map(r => headers.map((_, i) => (r.vals[i] ?? "").trim()));
  const lines = raw.slice(1).map(r => r.line);
  if (rows.length > MAX_ROWS) throw new ImportError(`Слишком много строк: ${rows.length} (максимум ${MAX_ROWS})`);
  return { headers, rows, lines };
}

const fold = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_.:]+/g, " ").trim();

export type Mapping = Record<string, number>;

export function suggestMapping(entity: Entity, headers: string[]): Mapping {
  const h = headers.map(fold), out: Mapping = {}, used = new Set<number>();
  for (const f of FIELDS[entity]) {
    const labels = (Object.keys(DICTS) as ImportLang[]).map(l => fieldLabel(l, entity, f.key));
    for (const a of [...labels, ...f.aliases].map(fold)) {
      const i = h.findIndex((x, idx) => x === a && !used.has(idx));
      if (i >= 0) { out[f.key] = i; used.add(i); break; }
    }
  }
  return out;
}

export function parseMapping(entity: Entity, raw: unknown, columns: number): Mapping {
  const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  const out: Mapping = {};
  for (const f of FIELDS[entity]) {
    const v = obj?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    const i = Number(v);
    if (Number.isInteger(i) && i >= 0 && i < columns) out[f.key] = i;
  }
  const missing = FIELDS[entity].filter(f => f.required && out[f.key] === undefined);
  if (missing.length) throw new ImportError(`Не сопоставлены обязательные поля: ${missing.map(f => f.key).join(", ")}`);
  return out;
}

// ── Value parsers ────────────────────────────────────────────────────────
export function parseDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(t)) return isoOf(new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 86_400_000)); // Excel serial
  return null;
}
function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100 ? isoOf(dt) : null;
}

export function parseAmount(v: string): number | null {
  let t = v.replace(/[\s ']/g, "").replace(/[^\d.,-]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  const x = Number(t);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

const METHOD_ALIASES: Record<string, string> = {
  bank: "bank", банк: "bank", безнал: "bank", перечисление: "bank", banca: "bank", transfer: "bank", virament: "bank",
  cash: "cash", наличные: "cash", нал: "cash", касса: "cash", numerar: "cash",
  card: "card", карта: "card",
  offset: "offset", взаимозачет: "offset", взаимозачёт: "offset", зачет: "offset", compensare: "offset",
  other: "other", другое: "other", altele: "other",
};
const SOURCE_ALIASES: Record<string, string> = {
  web: "web", сайт: "web", site: "web", website: "web", интернет: "web",
  referral: "referral", рекомендация: "referral", recomandare: "referral",
  cold_call: "cold_call", "cold call": "cold_call", звонок: "cold_call", "холодный звонок": "cold_call", apel: "cold_call",
  social: "social", соцсети: "social", "social media": "social", facebook: "social", instagram: "social",
  exhibition: "exhibition", выставка: "exhibition", expozitie: "exhibition",
  other: "other", другое: "other", altele: "other",
};

// ── Run (check or commit) ────────────────────────────────────────────────
export type RowStatus = "ok" | "skip" | "error";
export interface RowResult { row: number; status: RowStatus; message: string; label: string }
export interface RunResult {
  dryRun: boolean; total: number; created: number; skipped: number; errors: number;
  rows: RowResult[]; log_id: number | null;
}

type Exec = (sql: string, b: Record<string, unknown>) => Promise<Row[]>;
type ExecOut = (sql: string, b: Record<string, unknown>) => Promise<number>;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const digits = (v: string) => v.replace(/\D/g, "");

export async function run(entity: Entity, sheet: Sheet, mapping: Mapping, user: string, filename: string, dryRun: boolean): Promise<RunResult> {
  const conn = await getConnection();
  const exec: Exec = async (sql, b) => ((await conn.execute(sql, b as never, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? []) as Row[];
  const execOut: ExecOut = async (sql, b) => {
    const r = await conn.execute(sql, { ...b, out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } } as never);
    return n((r.outBinds as { out_id: number[] }).out_id[0]);
  };
  const cell = (r: string[], key: string) => (mapping[key] !== undefined ? (r[mapping[key]] ?? "").trim() : "");
  const results: RowResult[] = [];
  const ids: number[] = [];
  try {
    const fn = entity === "customers" ? importCustomers : entity === "leads" ? importLeads : importPayments;
    await fn(sheet.rows, sheet.lines, cell, results, ids, exec, execOut, user);
    const created = results.filter(r => r.status === "ok").length;
    const skipped = results.filter(r => r.status === "skip").length;
    const errors = results.filter(r => r.status === "error").length;
    let logId: number | null = null;
    if (!dryRun) {
      if (!created) throw new ImportError("Нет новых строк для загрузки");
      logId = await execOut(`
        INSERT INTO AGRO_CRM_IMPORT_LOG (ENTITY_TYPE, FILENAME, TOTAL_ROWS, CREATED_COUNT, SKIPPED_COUNT, ERROR_COUNT, CREATED_IDS, CREATED_BY)
        VALUES (:e, :f, :t, :c, :s, :er, :ids, :u) RETURNING ID INTO :out_id`,
        { e: entity, f: filename.slice(0, 255), t: sheet.rows.length, c: created, s: skipped, er: errors, ids: JSON.stringify(ids), u: user });
      await conn.commit();
    } else await conn.rollback();
    return { dryRun, total: sheet.rows.length, created, skipped, errors, rows: results, log_id: logId };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.close();
  }
}

type Cell = (r: string[], key: string) => string;
type Importer = (rows: string[][], lines: number[], cell: Cell, out: RowResult[], ids: number[], exec: Exec, execOut: ExecOut, user: string) => Promise<void>;

// Oracle rolls back only the failed statement, so one bad row does not
// spoil the transaction — it is reported and the rest continue.
const dbMessage = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "Ошибка базы данных");

const importCustomers: Importer = async (rows, lines, cell, out, ids, exec, execOut, user) => {
  const existing = await exec(`SELECT ID, CODE, UPPER(TRIM(NAME)) AS NAME, TAX_ID FROM AGRO_CUSTOMERS`, {});
  const byName = new Set(existing.map(r => s(r.NAME)));
  const byCode = new Set(existing.map(r => s(r.CODE).toUpperCase()));
  const byTax = new Set(existing.map(r => digits(s(r.TAX_ID))).filter(x => x.length >= 6));
  let next = Math.max(0, ...existing.map(r => s(r.CODE).match(/^CUS(\d+)$/)).filter(Boolean).map(m => Number(m![1]))) + 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], line = lines[i];
    const name = cell(r, "name"), tax = cell(r, "tax_id"), email = cell(r, "email");
    let code = cell(r, "code").toUpperCase();
    const label = name || `#${line}`;
    if (!name) { out.push({ row: line, status: "error", message: "Пустое название", label }); continue; }
    if (name.length > 300) { out.push({ row: line, status: "error", message: "Название длиннее 300 символов", label }); continue; }
    if (email && !isEmail(email)) { out.push({ row: line, status: "error", message: `Неверный email: ${email}`, label }); continue; }
    if (tax && byTax.has(digits(tax))) { out.push({ row: line, status: "skip", message: `Фискальный код ${tax} уже есть`, label }); continue; }
    if (byName.has(name.toUpperCase())) { out.push({ row: line, status: "skip", message: "Клиент с таким названием уже есть", label }); continue; }
    if (code && byCode.has(code)) { out.push({ row: line, status: "skip", message: `Код ${code} уже есть`, label }); continue; }
    const tRaw = fold(cell(r, "customer_type"));
    const type = /^(export|экспорт|extern|externa|внешн)/.test(tRaw) ? "export" : "domestic";
    if (!code) { code = `CUS${String(next++).padStart(3, "0")}`; }
    try {
      const id = await execOut(`
        INSERT INTO AGRO_CUSTOMERS (CODE, NAME, COUNTRY, TAX_ID, CONTACT_PHONE, CONTACT_EMAIL, ADDRESS, CUSTOMER_TYPE, CREATED_BY)
        VALUES (:code, :name, :country, :tax, :phone, :email, :addr, :type, :u) RETURNING ID INTO :out_id`,
        { code: code.slice(0, 50), name, country: cell(r, "country").slice(0, 100) || null, tax: tax.slice(0, 50) || null,
          phone: cell(r, "phone").slice(0, 50) || null, email: email.slice(0, 200) || null, addr: cell(r, "address").slice(0, 500) || null, type, u: user });
      ids.push(id);
      byName.add(name.toUpperCase()); byCode.add(code); if (digits(tax).length >= 6) byTax.add(digits(tax));
      out.push({ row: line, status: "ok", message: code, label });
    } catch (e) {
      out.push({ row: line, status: "error", message: dbMessage(e), label });
    }
  }
};

const importLeads: Importer = async (rows, lines, cell, out, ids, exec, execOut, user) => {
  const existing = await exec(`SELECT UPPER(TRIM(NAME)) || '|' || UPPER(TRIM(COMPANY)) AS K, PHONE, LOWER(EMAIL) AS EMAIL FROM AGRO_CRM_LEADS`, {});
  const keys = new Set(existing.map(r => s(r.K)));
  const phones = new Set(existing.map(r => digits(s(r.PHONE))).filter(x => x.length >= 6));
  const emails = new Set(existing.map(r => s(r.EMAIL)).filter(Boolean));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], line = lines[i];
    const name = cell(r, "name"), company = cell(r, "company"), phone = cell(r, "phone"), email = cell(r, "email").toLowerCase();
    const label = [name, company].filter(Boolean).join(" · ") || `#${line}`;
    if (!name) { out.push({ row: line, status: "error", message: "Пустое имя", label }); continue; }
    if (email && !isEmail(email)) { out.push({ row: line, status: "error", message: `Неверный email: ${email}`, label }); continue; }
    if (digits(phone).length >= 6 && phones.has(digits(phone))) { out.push({ row: line, status: "skip", message: `Телефон ${phone} уже есть`, label }); continue; }
    if (email && emails.has(email)) { out.push({ row: line, status: "skip", message: `Email ${email} уже есть`, label }); continue; }
    const key = `${name.toUpperCase()}|${company.toUpperCase()}`;
    if (keys.has(key)) { out.push({ row: line, status: "skip", message: "Такой лид уже есть", label }); continue; }
    const src = SOURCE_ALIASES[fold(cell(r, "source"))] ?? "other";
    try {
      const id = await execOut(`
        INSERT INTO AGRO_CRM_LEADS (NAME, COMPANY, PHONE, EMAIL, SOURCE, NOTES, CREATED_BY)
        VALUES (:name, :company, :phone, :email, :src, :notes, :u) RETURNING ID INTO :out_id`,
        { name: name.slice(0, 255), company: company.slice(0, 255) || null, phone: phone.slice(0, 50) || null,
          email: email.slice(0, 255) || null, src, notes: cell(r, "notes") || null, u: user });
      ids.push(id);
      keys.add(key); if (digits(phone).length >= 6) phones.add(digits(phone)); if (email) emails.add(email);
      out.push({ row: line, status: "ok", message: src, label });
    } catch (e) {
      out.push({ row: line, status: "error", message: dbMessage(e), label });
    }
  }
};

const importPayments: Importer = async (rows, lines, cell, out, ids, exec, _execOut, user) => {
  const custs = await exec(`SELECT ID, CODE, NAME, TAX_ID FROM AGRO_CUSTOMERS`, {});
  const byCode = new Map(custs.map(c => [s(c.CODE).toUpperCase(), c]));
  const byTax = new Map(custs.filter(c => digits(s(c.TAX_ID)).length >= 6).map(c => [digits(s(c.TAX_ID)), c]));
  const byName = new Map(custs.map(c => [fold(s(c.NAME)), c]));
  const docs = await exec(`SELECT ID, CUSTOMER_ID, UPPER(DOC_NUMBER) AS DN, UPPER(INVOICE_NUMBER) AS INV, NVL(CURRENCY_CODE, 'MDL') AS CUR FROM AGRO_SALES_DOCS`, {});
  const existing = await exec(`
    SELECT CUSTOMER_ID || '|' || TO_CHAR(PAY_DATE, 'YYYY-MM-DD') || '|' || TO_CHAR(AMOUNT, 'FM999999999990.00') || '|' || CURRENCY_CODE || '|' || UPPER(NVL(REFERENCE, '')) AS K
      FROM AGRO_CRM_PAYMENTS WHERE STATUS = 'active'`, {});
  const seen = new Set(existing.map(r => s(r.K)));
  const rates = new Map<string, number | null>();
  const today = isoOf(new Date());

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], line = lines[i];
    const who = cell(r, "customer");
    const c = byCode.get(who.toUpperCase()) ?? (digits(who).length >= 6 && digits(who) === who.replace(/\s/g, "") ? byTax.get(digits(who)) : undefined) ?? byName.get(fold(who));
    const label = c ? s(c.NAME) : who || `#${line}`;
    if (!c) { out.push({ row: line, status: "error", message: who ? `Клиент «${who}» не найден (ищем по коду, фискальному коду и названию)` : "Не указан клиент", label }); continue; }
    const date = parseDate(cell(r, "pay_date"));
    if (!date) { out.push({ row: line, status: "error", message: `Неверная дата: ${cell(r, "pay_date") || "пусто"}`, label }); continue; }
    if (date > today) { out.push({ row: line, status: "error", message: "Дата в будущем", label }); continue; }
    const amount = parseAmount(cell(r, "amount"));
    if (amount == null || amount <= 0) { out.push({ row: line, status: "error", message: `Неверная сумма: ${cell(r, "amount") || "пусто"}`, label }); continue; }

    let currency = cell(r, "currency").toUpperCase().replace("LEI", "MDL").replace("LEU", "MDL").replace("ЛЕЙ", "MDL");
    const docNo = cell(r, "document").toUpperCase();
    let docId: number | null = null;
    if (docNo) {
      const d = docs.find(x => n(x.CUSTOMER_ID) === n(c.ID) && (s(x.DN) === docNo || s(x.INV) === docNo));
      if (!d) { out.push({ row: line, status: "error", message: `Документ ${docNo} у этого клиента не найден`, label }); continue; }
      if (currency && currency !== s(d.CUR)) { out.push({ row: line, status: "error", message: `Валюта ${currency} не совпадает с валютой документа (${s(d.CUR)})`, label }); continue; }
      docId = n(d.ID); currency = s(d.CUR);
    }
    if (!currency) currency = "MDL";
    if (!/^[A-Z]{3}$/.test(currency)) { out.push({ row: line, status: "error", message: `Неверная валюта: ${currency}`, label }); continue; }
    const mRaw = fold(cell(r, "method"));
    const method = mRaw ? METHOD_ALIASES[mRaw] : "bank";
    if (!method || !(METHODS as readonly string[]).includes(method)) { out.push({ row: line, status: "error", message: `Неизвестный способ оплаты: ${cell(r, "method")}`, label }); continue; }
    const reference = cell(r, "reference").slice(0, 100) || null;

    const key = `${n(c.ID)}|${date}|${amount.toFixed(2)}|${currency}|${(reference ?? "").toUpperCase()}`;
    if (seen.has(key)) { out.push({ row: line, status: "skip", message: "Такая оплата уже внесена", label }); continue; }

    const rk = `${currency}|${date}`;
    if (!rates.has(rk)) rates.set(rk, await rateOn(currency, date));
    const p: NewPayment = { customer_id: n(c.ID), sales_doc_id: docId, pay_date: date, amount, currency, method, reference, notes: cell(r, "notes").slice(0, 500) || null };
    try {
      const res = await insertPayment(exec, p, rates.get(rk) ?? null, s(c.NAME), user);
      ids.push(res.id);
      seen.add(key);
      out.push({ row: line, status: "ok", message: `${amount.toFixed(2)} ${currency}${docId ? ` → ${docNo}` : ""}`, label });
    } catch (e) {
      out.push({ row: line, status: "error", message: dbMessage(e), label });
    }
  }
};

// ── Templates, journal, undo ─────────────────────────────────────────────
const EXAMPLES: Record<Entity, Record<string, string | number | Date>> = {
  customers: { name: "SRL Exemplu", code: "", tax_id: "1003600123456", country: "Moldova", phone: "+373 69 123 456", email: "office@exemplu.md", address: "Chișinău, str. Exemplu 1", customer_type: "domestic" },
  leads: { name: "Ion Popescu", company: "SRL Exemplu", phone: "+373 69 123 456", email: "ion@exemplu.md", source: "referral", notes: "" },
  payments: { customer: "CUS001", pay_date: new Date(), amount: 15000, currency: "MDL", document: "", method: "bank", reference: "п/п 123", notes: "" },
};

export async function template(entity: Entity, lang: ImportLang): Promise<Buffer> {
  const headers = Object.fromEntries(FIELDS[entity].map(f => [f.key, fieldLabel(lang, entity, f.key)]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(entity);
  const fields = FIELDS[entity];
  ws.columns = fields.map(f => ({ header: headers[f.key] ?? f.key, key: f.key, width: Math.max(14, (headers[f.key] ?? f.key).length + 4) }));
  ws.addRow(Object.fromEntries(fields.map(f => [f.key, EXAMPLES[entity][f.key] ?? ""])));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF8" } };
  fields.forEach((f, i) => { if (f.required) ws.getRow(1).getCell(i + 1).font = { bold: true, color: { argb: "FFC00000" } }; });
  if (entity === "payments") ws.getColumn("pay_date").numFmt = "dd.mm.yyyy";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function importLog(entities: Entity[]) {
  if (!entities.length) return [];
  const b: Record<string, string> = {};
  entities.forEach((e, i) => { b[`e${i}`] = e; });
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT ID, ENTITY_TYPE, FILENAME, TOTAL_ROWS, CREATED_COUNT, SKIPPED_COUNT, ERROR_COUNT, CREATED_BY, CREATED_AT, UNDONE_BY, UNDONE_AT
        FROM AGRO_CRM_IMPORT_LOG WHERE ENTITY_TYPE IN (${entities.map((_, i) => `:e${i}`).join(",")}) ORDER BY ID DESC
    ) WHERE ROWNUM <= 50`, b);
  return rows.map(r => ({
    id: n(r.ID), entity: s(r.ENTITY_TYPE), filename: s(r.FILENAME), total: n(r.TOTAL_ROWS), created: n(r.CREATED_COUNT),
    skipped: n(r.SKIPPED_COUNT), errors: n(r.ERROR_COUNT), created_by: s(r.CREATED_BY),
    created_at: r.CREATED_AT instanceof Date ? r.CREATED_AT.toISOString() : null,
    undone_by: s(r.UNDONE_BY) || null, undone_at: r.UNDONE_AT instanceof Date ? r.UNDONE_AT.toISOString() : null,
  }));
}

// Only payment imports can be undone: the payments are cancelled (kept for
// the audit trail). Customers and leads may already be used elsewhere.
export async function undoImport(id: number, user: string) {
  const rows = await query<Row>(`SELECT ENTITY_TYPE, CREATED_IDS, UNDONE_AT FROM AGRO_CRM_IMPORT_LOG WHERE ID = :1`, [id]);
  if (!rows.length) throw new ImportError("Импорт не найден");
  if (rows[0].ENTITY_TYPE !== "payments") throw new ImportError("Отменить можно только импорт оплат");
  if (rows[0].UNDONE_AT) throw new ImportError("Импорт уже отменён");
  const ids = (JSON.parse(s(rows[0].CREATED_IDS) || "[]") as number[]).filter(x => Number.isInteger(x));
  let cancelled = 0;
  for (const pid of ids) {
    const st = await query<Row>(`SELECT STATUS FROM AGRO_CRM_PAYMENTS WHERE ID = :1`, [pid]);
    if (st[0]?.STATUS !== "active") continue;
    await cancelPayment(pid, `Отмена импорта #${id}`, user);
    cancelled++;
  }
  await execute(`UPDATE AGRO_CRM_IMPORT_LOG SET UNDONE_BY = :1, UNDONE_AT = SYSDATE WHERE ID = :2`, [user, id]);
  return { cancelled };
}
