import ExcelJS from "exceljs";
import type { Lang } from "@/lib/documents/common";
import type { ColType, ReportDef } from "./index";
import { COLUMN_LABELS, VALUE_LABELS } from "./labels";

type Row = Record<string, unknown>;

export interface ReportColumn { key: string; label: string; type: ColType }
export interface ReportTable {
  columns: ReportColumn[];
  rows: Row[];
  totals: Record<string, number> | null;
}

const SUMMED: ColType[] = ["kg", "int", "mdl"];

// Applies header + coded value translations and computes the totals row.
// "money" columns are only totalled when every row is in one currency —
// sales/purchases mix EUR/MDL/USD, and the *_mdl columns cover the rest.
export function buildTable(def: ReportDef, raw: Row[], lang: Lang): ReportTable {
  const labels = COLUMN_LABELS[lang];
  const values = VALUE_LABELS[lang];
  const columns = def.columns.map(([key, type]) => ({ key, type, label: labels[key] ?? key }));

  const rows = raw.map(r => {
    const o: Row = {};
    for (const c of columns) {
      const v = r[c.key];
      o[c.key] = c.type === "code" && typeof v === "string" ? values[c.key]?.[v] ?? v : v ?? null;
    }
    return o;
  });

  const currencies = new Set(raw.map(r => r.currency_code).filter(Boolean));
  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (SUMMED.includes(c.type) || (c.type === "money" && currencies.size <= 1)) {
      totals[c.key] = Math.round(raw.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) * 1000) / 1000;
    }
  }
  return { columns, rows, totals: rows.length && Object.keys(totals).length ? totals : null };
}

const TOTAL_LABEL: Record<Lang, string> = { ro: "TOTAL", ru: "ИТОГО", en: "TOTAL" };

const NUM_FMT: Partial<Record<ColType, string>> = {
  kg: "#,##0.0", int: "#,##0", num: "0", money: "#,##0.00", mdl: "#,##0.00", price: "#,##0.00##",
  date: "dd.mm.yyyy", datetime: "dd.mm.yyyy hh:mm",
};

// Oracle DATEs arrive as local-time JS Dates; exceljs writes Dates as UTC,
// so re-anchor the local wall-clock time to UTC or every date shifts a day.
function excelDate(v: unknown): Date | null {
  const d = v instanceof Date ? v : v ? new Date(String(v)) : null;
  if (!d || isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

export async function toXlsx(table: ReportTable, title: string, lang: Lang): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = table.columns.map(c => ({ header: c.label, key: c.key, style: NUM_FMT[c.type] ? { numFmt: NUM_FMT[c.type] } : {} }));

  for (const r of table.rows) {
    const values: Row = {};
    for (const c of table.columns) {
      const v = r[c.key];
      if (v == null || v === "") continue;
      if (c.type === "date" || c.type === "datetime") values[c.key] = excelDate(v);
      else if (["kg", "int", "num", "money", "mdl", "price"].includes(c.type)) values[c.key] = Number(v);
      else values[c.key] = String(v);
    }
    ws.addRow(values);
  }

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
  });
  if (table.rows.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: table.rows.length + 1, column: table.columns.length } };
  }

  if (table.totals) {
    const t: Row = { [table.columns[0].key]: TOTAL_LABEL[lang] };
    for (const [k, v] of Object.entries(table.totals)) t[k] = v;
    const row = ws.addRow(t);
    row.font = { bold: true };
    row.eachCell(cell => { cell.border = { top: { style: "thin", color: { argb: "FF000000" } } }; });
  }

  // Width from the longest header/value, capped so free-text columns stay readable.
  table.columns.forEach((c, i) => {
    const longest = table.rows.reduce((m, r) => {
      const v = r[c.key];
      const len = c.type === "date" ? 10 : c.type === "datetime" ? 16 : v == null ? 0 : String(v).length;
      return Math.max(m, len);
    }, Math.min(c.label.length, 24));
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 8), 45);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function pad(n: number) { return String(n).padStart(2, "0"); }

// ";"-separated with "," decimals and a UTF-8 BOM — what Excel expects with
// RO/RU regional settings (Cyrillic opens correctly, numbers stay numbers).
export function toCsv(table: ReportTable, lang: Lang): string {
  const cell = (v: unknown, type: ColType): string => {
    if (v == null || v === "") return "";
    if (type === "date" || type === "datetime") {
      const d = v instanceof Date ? v : new Date(String(v));
      if (isNaN(d.getTime())) return String(v);
      const day = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
      return type === "date" ? day : `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.map(c => cell(c.label, "text")).join(";")];
  for (const r of table.rows) lines.push(table.columns.map(c => cell(r[c.key], c.type)).join(";"));
  if (table.totals) {
    lines.push(table.columns.map((c, i) =>
      i === 0 ? TOTAL_LABEL[lang] : c.key in table.totals! ? cell(Math.round(table.totals![c.key] * 100) / 100, c.type) : "").join(";"));
  }
  return "﻿" + lines.join("\r\n");
}
