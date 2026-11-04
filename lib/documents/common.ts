// Shared helpers for the printable documents ported from Artgranit
// (templates/agro/document_*.html + AgroStore.get_document_data).
import { query } from "@/lib/oracle";

export type Row  = Record<string, unknown>;
export type Lang = "ro" | "ru" | "en";

export class DocNotFound extends Error {}

export function s(v: unknown) { return v == null ? "" : String(v); }
export function n(v: unknown) { return v == null ? 0 : Number(v); }
export function nOrNull(v: unknown) { return v == null ? null : Number(v); }

export function parseLang(v: string | null | undefined): Lang {
  return v === "ru" || v === "en" ? v : "ro";
}

// RU name for the RU print, RO otherwise (EN prints use RO — AGRO_ITEMS has
// no English names), falling back to whichever one is filled in.
export function pickName(lang: Lang, ro: unknown, ru: unknown) {
  return lang === "ru" ? s(ru) || s(ro) : s(ro) || s(ru);
}

export function fmtDate(v: unknown) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(v: unknown) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${fmtDate(d)} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export function round3(x: number) { return Math.round(x * 1000) / 1000; }

// ── Company details ──────────────────────────────────────────────────────
// Stored in AGRO_MODULE_CONFIG as COMPANY_* keys (group "company"), edited
// in Settings > Company. COMPANY_NAME is shared with Artgranit, which prints
// it on its own acts. An older CRM fiscal invoice used lowercase company.*
// keys — still read as a fallback.
export const COMPANY_FIELDS = [
  "name", "address", "fiscal_code", "vat_code", "iban", "bank", "bank_code",
  "phone", "email", "director", "accountant",
] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export type Company = Record<CompanyField, string>;

const configKey = (f: CompanyField) => `COMPANY_${f.toUpperCase()}`;

export async function getCompany(): Promise<Company> {
  const cfg: Record<string, string> = {};
  try {
    const rows = await query<Row>(
      `SELECT CONFIG_KEY, CONFIG_VALUE FROM AGRO_MODULE_CONFIG
        WHERE UPPER(CONFIG_KEY) LIKE 'COMPANY\\_%' ESCAPE '\\' OR UPPER(CONFIG_KEY) LIKE 'COMPANY.%'`
    );
    // Exact COMPANY_* keys win over the legacy company.* ones.
    const legacy = (r: Row) => (s(r.CONFIG_KEY).includes(".") ? 0 : 1);
    for (const r of rows.sort((a, b) => legacy(a) - legacy(b))) {
      cfg[s(r.CONFIG_KEY).toUpperCase().replace(".", "_")] = s(r.CONFIG_VALUE);
    }
  } catch { /* config table unavailable — fall back to env */ }
  const out = Object.fromEntries(COMPANY_FIELDS.map(f => [f, cfg[configKey(f)] ?? ""])) as Company;
  out.name ||= process.env.COMPANY_NAME || "AGRO Company SRL";
  return out;
}

export async function saveCompany(values: Partial<Company>) {
  const { execute } = await import("@/lib/oracle");
  for (const f of COMPANY_FIELDS) {
    if (!(f in values)) continue;
    const v = String(values[f] ?? "").trim().slice(0, 1000);
    await execute(
      `MERGE INTO AGRO_MODULE_CONFIG t
       USING (SELECT :k AS K FROM DUAL) src ON (t.CONFIG_KEY = src.K)
       WHEN MATCHED THEN UPDATE SET CONFIG_VALUE = :v
       WHEN NOT MATCHED THEN INSERT (CONFIG_KEY, CONFIG_VALUE, CONFIG_GROUP, DESCRIPTION)
                             VALUES (:k, :v, 'company', :d)`,
      { k: configKey(f), v, d: `Company ${f.replace("_", " ")} (CRM settings)` });
  }
}

// ── Packaging kinds (ported 1:1 from agro_oracle_store.py) ───────────────
// Printed documents say "containere" instead of "palete" when apples come
// in containers, and "saci" instead of "lazi" for sacks (client audit request).
export type PalletKind = "pallet" | "container" | "mixed";
export type CrateKind  = "crate" | "sack" | "mixed";
export type TareKind   = "pallet" | "container" | "crate" | "sack" | "mixed";

export function palletKind(...names: unknown[]): PalletKind {
  for (const nm of names) {
    const low = s(nm).toLowerCase();
    if (low.includes("conteiner") || low.includes("container") || low.includes("контейнер")) return "container";
  }
  return "pallet";
}

export function crateKind(...names: unknown[]): CrateKind {
  for (const nm of names) {
    const low = s(nm).toLowerCase();
    if (/(?<![a-z])saci?(?![a-z])/.test(low) || low.includes("мешок") || low.includes("мешки")) return "sack";
  }
  return "crate";
}

export function mergeKind<K extends string>(kinds: (K | null | undefined)[], dflt: K): K | "mixed" {
  const ks = new Set(kinds.filter(Boolean) as K[]);
  if (ks.size === 0) return dflt;
  return ks.size === 1 ? [...ks][0] : "mixed";
}

// Tare per crate/sack when the line counts them, otherwise per
// pallet/container (apples in containers have no crate count).
export function tareUnit(
  totalTare: number, crates: number, palletUnits: number,
  ck: CrateKind | "mixed", pk: PalletKind | "mixed",
): [number | null, TareKind | null] {
  if (crates)      return [round3(totalTare / crates), ck];
  if (palletUnits) return [round3(totalTare / palletUnits), pk];
  return [null, null];
}
