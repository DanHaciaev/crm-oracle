// Reference tables shared with DIPP FRUICT (warehouses, cells, packaging,
// varieties, vehicles, acceptance profiles), edited from the CRM through
// one config-driven engine. Mirrors DIPP FRUICT's AgroStore rules: IDs from
// the table's own sequence (skipping IDs already taken, like
// _next_unused_id), the same auto-codes (get_next_code: WH###, PAK###,
// {warehouse}-A…), and the DB CHECK lists validated up front. No hard
// delete — records are deactivated, so documents that reference them stay
// intact (DIPP FRUICT's purge needs an impact check the CRM doesn't do).
import oracledb from "oracledb";
import { query, getConnection } from "@/lib/oracle";
import type { Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;

export type FieldType = "text" | "number" | "select" | "bool" | "ref";
export interface Field {
  key: string; type: FieldType; required?: boolean;
  options?: string[];                  // select: allowed values (= DB CHECK list)
  ref?: "warehouses" | "items" | "customers";
  list?: boolean;                      // shown as a column in the table
  wide?: boolean; auto?: boolean;      // auto = generated when left empty
  upper?: boolean; max?: number;
}
export interface DirDef {
  table: string; seq: string; nameKey: string;
  audit?: boolean;                     // has CREATED_BY / UPDATED_BY / UPDATED_AT
  usage?: string;                      // SQL returning ID, N (how many records reference it)
  fields: Field[];
}

const yn = (key: string): Field => ({ key, type: "bool" });
const num = (key: string, list = false): Field => ({ key, type: "number", list });

export const DIRECTORIES: Record<string, DirDef> = {
  warehouses: {
    table: "AGRO_WAREHOUSES", seq: "AGRO_WAREHOUSES_SEQ", nameKey: "name", audit: true,
    usage: `SELECT WAREHOUSE_ID AS ID, COUNT(*) AS N FROM AGRO_BATCHES WHERE STATUS IN ('active','blocked') GROUP BY WAREHOUSE_ID`,
    fields: [
      { key: "code", type: "text", auto: true, list: true, upper: true, max: 20 },
      { key: "name", type: "text", required: true, list: true, wide: true, max: 100 },
      { key: "warehouse_type", type: "select", options: ["cold_storage", "dry", "processing"], list: true },
      { key: "address", type: "text", wide: true, max: 200 },
      num("capacity_kg", true),
    ],
  },
  cells: {
    table: "AGRO_STORAGE_CELLS", seq: "AGRO_STORAGE_CELLS_SEQ", nameKey: "code",
    usage: `SELECT CELL_ID AS ID, COUNT(*) AS N FROM AGRO_BATCHES WHERE STATUS IN ('active','blocked') AND CELL_ID IS NOT NULL GROUP BY CELL_ID`,
    fields: [
      { key: "warehouse_id", type: "ref", ref: "warehouses", required: true, list: true },
      { key: "code", type: "text", auto: true, list: true, upper: true, max: 20 },
      { key: "name", type: "text", list: true, max: 100 },
      { key: "cell_type", type: "select", options: ["chamber", "section", "zone", "shelf", "pallet"], list: true },
      num("temp_min", true), num("temp_max", true), num("humidity_min"), num("humidity_max"), num("capacity_kg", true),
    ],
  },
  packaging: {
    table: "AGRO_PACKAGING_TYPES", seq: "AGRO_PACKAGING_TYPES_SEQ", nameKey: "name_ru", audit: true,
    fields: [
      { key: "code", type: "text", auto: true, list: true, upper: true, max: 30 },
      { key: "name_ro", type: "text", list: true, max: 100 },
      { key: "name_ru", type: "text", required: true, list: true, max: 100 },
      { key: "category", type: "select", options: ["crate", "pallet"], required: true, list: true },
      num("tare_weight_kg", true), num("capacity_kg", true),
    ],
  },
  varieties: {
    table: "AGRO_ITEM_VARIETIES", seq: "AGRO_ITEM_VARIETIES_SEQ", nameKey: "name_ru",
    fields: [
      { key: "item_id", type: "ref", ref: "items", required: true, list: true },
      { key: "code", type: "text", auto: true, list: true, upper: true, max: 20 },
      { key: "name_ro", type: "text", list: true, max: 100 },
      { key: "name_ru", type: "text", required: true, list: true, max: 100 },
      num("min_calibre_mm", true), num("min_brix", true), num("shelf_life_days", true),
      num("optimal_temp_min"), num("optimal_temp_max"), num("color_coverage_pct"),
      { key: "notes", type: "text", wide: true, max: 500 },
    ],
  },
  vehicles: {
    table: "AGRO_VEHICLES", seq: "AGRO_VEHICLES_SEQ", nameKey: "plate_number",
    fields: [
      { key: "plate_number", type: "text", required: true, list: true, upper: true, max: 20 },
      { key: "vehicle_type", type: "select", options: ["truck", "van", "refrigerator"], list: true },
      { key: "driver_name", type: "text", list: true, max: 100 },
    ],
  },
  profiles: {
    table: "AGRO_ACCEPTANCE_PROFILES", seq: "AGRO_ACCEPTANCE_PROFILES_SEQ", nameKey: "name_ru",
    fields: [
      { key: "code", type: "text", required: true, list: true, upper: true, max: 30 },
      { key: "name_ro", type: "text", list: true, max: 100 },
      { key: "name_ru", type: "text", required: true, list: true, max: 100 },
      { key: "customer_id", type: "ref", ref: "customers", list: true },
      { key: "required_class", type: "select", options: ["Extra", "I", "II"], list: true },
      yn("allow_class_ii"),
      num("min_calibre_mm"), num("max_below_min_pct"), num("max_mixed_size_pct"),
      num("max_minor_defects_pct"), num("max_serious_defects_pct"), num("min_brix"),
      num("temp_min_c"), num("temp_max_c"),
      yn("lab_req"), yn("phyto_req"), yn("trace_req"), yn("pack_req"), yn("label_req"),
      num("max_actives"), num("max_single_residue_pct_mrl"), num("max_total_residue_pct"), num("max_glyphosate_pct_mrl"),
      num("accept_min_score", true), num("accept_good_score"),
    ],
  },
};

export class DirError extends Error {}

const col = (k: string) => k.toUpperCase();

async function refOptions(lang: Lang) {
  const nm = lang === "ru" ? "NVL(NAME_RU, NAME_RO)" : "NVL(NAME_RO, NAME_RU)";
  const [warehouses, items, customers] = await Promise.all([
    query<Row>(`SELECT ID, CODE || ' · ' || NAME AS LABEL FROM AGRO_WAREHOUSES ORDER BY NAME`),
    query<Row>(`SELECT ID, ${nm} AS LABEL FROM AGRO_ITEMS ORDER BY 2`),
    query<Row>(`SELECT ID, NAME AS LABEL FROM AGRO_CUSTOMERS ORDER BY NAME`),
  ]);
  const map = (rows: Row[]) => rows.map(r => ({ id: Number(r.ID), label: String(r.LABEL ?? "") }));
  return { warehouses: map(warehouses), items: map(items), customers: map(customers) };
}

export async function listDirectory(kind: string, lang: Lang) {
  const def = DIRECTORIES[kind];
  if (!def) throw new DirError("Неизвестный справочник");
  const cols = ["ID", "ACTIVE", ...def.fields.map(f => col(f.key))];
  const [rows, usage, refs] = await Promise.all([
    query<Row>(`SELECT ${cols.join(", ")} FROM ${def.table} ORDER BY CASE WHEN ACTIVE = 'N' THEN 1 ELSE 0 END, ID`),
    def.usage ? query<Row>(def.usage) : Promise.resolve([] as Row[]),
    refOptions(lang),
  ]);
  const used = new Map(usage.map(u => [Number(u.ID), Number(u.N)]));
  return {
    fields: def.fields,
    refs,
    rows: rows.map(r => {
      const o: Record<string, unknown> = { id: Number(r.ID), active: r.ACTIVE !== "N", used: used.get(Number(r.ID)) ?? 0 };
      for (const f of def.fields) {
        const v = r[col(f.key)];
        o[f.key] = v == null ? null : f.type === "number" || f.type === "ref" ? Number(v) : f.type === "bool" ? v === "Y" : String(v);
      }
      return o;
    }),
  };
}

// Normalises and validates incoming values against the field config.
function clean(def: DirDef, body: Record<string, unknown>, isCreate: boolean) {
  const out: Record<string, string | number | null> = {};
  for (const f of def.fields) {
    if (!(f.key in body)) { if (isCreate && f.required && !f.auto) throw new DirError(`Поле «${f.key}» обязательно`); continue; }
    const raw = body[f.key];
    let v: string | number | null;
    if (f.type === "bool") v = raw === true || raw === "Y" ? "Y" : "N";
    else if (raw == null || String(raw).trim() === "") v = null;
    else if (f.type === "number" || f.type === "ref") {
      const n = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) throw new DirError(`Поле «${f.key}»: нужно число`);
      v = n;
    } else {
      let s = String(raw).trim().slice(0, f.max ?? 200);
      if (f.upper) s = s.toUpperCase();
      v = s;
    }
    if (f.type === "select" && v != null && !f.options!.includes(String(v))) throw new DirError(`Поле «${f.key}»: недопустимое значение`);
    if (v == null && f.required && !(f.auto && isCreate)) throw new DirError(`Поле «${f.key}» обязательно`);
    out[f.key] = v;
  }
  return out;
}

type Exec = (sql: string, binds: Record<string, unknown>) => Promise<Row[]>;

// DIPP FRUICT get_next_code rules.
async function nextCode(kind: string, values: Record<string, unknown>, exec: Exec): Promise<string> {
  if (kind === "cells") {
    const wh = await exec(`SELECT CODE FROM AGRO_WAREHOUSES WHERE ID = :id`, { id: values.warehouse_id });
    if (!wh.length) throw new DirError("Склад не найден");
    const prefix = `${String(wh[0].CODE)}-`;
    const rows = await exec(`SELECT CODE FROM AGRO_STORAGE_CELLS WHERE WAREHOUSE_ID = :id`, { id: values.warehouse_id });
    const letters = rows.map(r => String(r.CODE ?? "").toUpperCase()).filter(c => c.startsWith(prefix.toUpperCase()))
      .map(c => c.slice(prefix.length)).filter(s => /^[A-Z]+$/.test(s))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    const last = letters[letters.length - 1];
    const inc = (s: string): string => {
      const a = s.split(""); let i = a.length - 1;
      while (i >= 0) { if (a[i] < "Z") { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(""); } a[i] = "A"; i--; }
      return "A" + a.join("");
    };
    return prefix + (last ? inc(last) : "A");
  }
  if (kind === "varieties") {
    const rows = await exec(`SELECT CODE FROM AGRO_ITEM_VARIETIES WHERE ITEM_ID = :id`, { id: values.item_id });
    const max = rows.reduce((m, r) => Math.max(m, /^\d+$/.test(String(r.CODE)) ? Number(r.CODE) : 0), 0);
    return String(max + 1).padStart(2, "0");
  }
  const prefixes: Record<string, [string, number]> = { warehouses: ["WH", 3], packaging: ["PAK", 3] };
  const [p, width] = prefixes[kind];
  const def = DIRECTORIES[kind];
  const rows = await exec(`SELECT CODE FROM ${def.table} WHERE CODE LIKE :p`, { p: `${p}%` });
  const max = rows.reduce((m, r) => { const t = String(r.CODE).slice(p.length); return /^\d+$/.test(t) ? Math.max(m, Number(t)) : m; }, 0);
  return p + String(max + 1).padStart(width, "0");
}

// dryRun runs every statement and then rolls back (used to test the write
// path against the live DB without leaving anything behind).
export async function saveDirectory(kind: string, id: number | null, body: Record<string, unknown>, user: string, dryRun = false) {
  const def = DIRECTORIES[kind];
  if (!def) throw new DirError("Неизвестный справочник");
  const values = clean(def, body, id == null);
  const active = "active" in body ? (body.active === false || body.active === "N" ? "N" : "Y") : null;

  const conn = await getConnection();
  const exec: Exec = async (sql, binds) => ((await conn.execute(sql, binds as never, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? []) as Row[];
  try {
    let recordId = id;
    let before: Row | null = null;
    if (id == null) {
      // Same as DIPP FRUICT _next_unused_id: skip sequence values already used.
      for (let i = 0; i < 50 && recordId == null; i++) {
        const cand = Number((await exec(`SELECT ${def.seq}.NEXTVAL AS V FROM DUAL`, {}))[0].V);
        const taken = Number((await exec(`SELECT COUNT(*) AS C FROM ${def.table} WHERE ID = :id`, { id: cand }))[0].C);
        if (!taken) recordId = cand;
      }
      if (recordId == null) throw new DirError("Последовательность ID рассинхронизирована");
      const codeField = def.fields.find(f => f.key === "code");
      if (codeField?.auto && !values.code) values.code = await nextCode(kind, values, exec);
      const keys = Object.keys(values);
      const sqlCols = ["ID", "ACTIVE", ...keys.map(col)];
      const placeholders = [":id", ":active", ...keys.map((_, i) => `:v${i}`)];
      const binds: Record<string, unknown> = { id: recordId, active: active ?? "Y" };
      keys.forEach((k, i) => { binds[`v${i}`] = values[k]; });
      if (def.audit) { sqlCols.push("CREATED_BY"); placeholders.push(":usr"); binds.usr = user; }
      await conn.execute(`INSERT INTO ${def.table} (${sqlCols.join(", ")}) VALUES (${placeholders.join(", ")})`, binds as never);
    } else {
      const old = await exec(`SELECT * FROM ${def.table} WHERE ID = :id`, { id });
      if (!old.length) throw new DirError("Запись не найдена");
      before = old[0];
      const keys = Object.keys(values);
      const sets = keys.map((k, i) => `${col(k)} = :v${i}`);
      if (active) sets.push(`ACTIVE = :active`);
      if (def.audit) sets.push(`UPDATED_BY = :usr`, `UPDATED_AT = SYSDATE`);
      if (!sets.length) throw new DirError("Нечего сохранять");
      const binds: Record<string, unknown> = { id };
      keys.forEach((k, i) => { binds[`v${i}`] = values[k]; });
      if (active) binds.active = active;
      if (def.audit) binds.usr = user;
      await conn.execute(`UPDATE ${def.table} SET ${sets.join(", ")} WHERE ID = :id`, binds as never);
    }
    const name = String(values[def.nameKey] ?? before?.[col(def.nameKey)] ?? "");
    await conn.execute(
      `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
       VALUES (:t, :id, :name, :act, :usr, :old, :new)`,
      { t: `dir_${kind}`, id: recordId, name: name.slice(0, 200), act: id == null ? "create" : "update", usr: user,
        old: before ? JSON.stringify(Object.fromEntries(Object.keys(values).concat(active ? ["active"] : []).map(k => [k, before![col(k)] ?? null]))).slice(0, 4000) : null,
        new: JSON.stringify({ ...values, ...(active ? { active } : {}) }).slice(0, 4000) } as never);
    if (dryRun) await conn.rollback(); else await conn.commit();
    return { id: recordId, code: values.code ?? null };
  } catch (e) {
    await conn.rollback().catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (/ORA-00001/.test(msg)) throw new DirError("Запись с таким кодом / номером уже есть");
    if (/ORA-02291/.test(msg)) throw new DirError("Связанная запись не найдена");
    if (/ORA-02290/.test(msg)) throw new DirError("Значение не прошло проверку базы");
    if (/ORA-12899/.test(msg)) throw new DirError("Слишком длинное значение");
    throw e;
  } finally {
    await conn.close();
  }
}
