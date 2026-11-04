"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Play } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT, useLocale } from "@/lib/locale";
import { REPORT_TITLES, VALUE_LABELS } from "@/lib/reports/labels";
import type { ColType, FilterKey } from "@/lib/reports";

interface Option { id: number; name: string }
interface Catalog {
  reports: { key: string; filters: FilterKey[]; statuses: string[] }[];
  warehouses: Option[]; suppliers: Option[]; customers: Option[];
  items: { id: number; name_ro: string; name_ru: string }[];
}
interface Result {
  title: string;
  columns: { key: string; label: string; type: ColType }[];
  rows: Record<string, unknown>[];
  total: number; truncated: boolean;
  totals: Record<string, number> | null;
}

const GROUPS: { label: "groupPurchases" | "groupSales" | "groupStock"; keys: string[] }[] = [
  { label: "groupPurchases", keys: ["purchases", "purchase_lines"] },
  { label: "groupSales",     keys: ["sales", "sales_lines"] },
  { label: "groupStock",     keys: ["stock", "stock_batches", "stock_by_supplier", "movements", "expiry", "mass_balance"] },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function fmtCell(v: unknown, type: ColType) {
  if (v == null || v === "") return "—";
  if (type === "date" || type === "datetime") {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    return type === "date"
      ? d.toLocaleDateString("ru-RU")
      : `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const n = Number(v);
  if (type === "kg")    return n.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (type === "int" || type === "num") return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  if (type === "money" || type === "mdl") return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === "price") return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return String(v);
}

const NUMERIC: ColType[] = ["kg", "int", "num", "money", "mdl", "price"];

export default function ReportsPage() {
  const t = useT();
  const { locale } = useLocale();
  const lang = locale === "ru" || locale === "en" ? locale : "ro";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [report, setReport]   = useState("purchase_lines");
  const today = new Date();
  const [dateFrom, setDateFrom]     = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo]         = useState(iso(today));
  const [warehouse, setWarehouse]   = useState("");
  const [item, setItem]             = useState("");
  const [supplier, setSupplier]     = useState("");
  const [customer, setCustomer]     = useState("");
  const [status, setStatus]         = useState("");
  const [days, setDays]             = useState("30");
  const [result, setResult]         = useState<Result | null>(null);
  const [loading, setLoading]       = useState(false);
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Catalog) => setCatalog(d))
      .catch(() => setError(t("common.error")));
  }, [t]);

  const def = catalog?.reports.find(r => r.key === report);
  const has = (f: FilterKey) => def?.filters.includes(f) ?? false;

  function qs(format: string) {
    const sp = new URLSearchParams({ format, lang });
    if (has("period"))    { sp.set("date_from", dateFrom); sp.set("date_to", dateTo); }
    if (has("warehouse") && warehouse) sp.set("warehouse_id", warehouse);
    if (has("item") && item)           sp.set("item_id", item);
    if (has("supplier") && supplier)   sp.set("supplier_id", supplier);
    if (has("customer") && customer)   sp.set("customer_id", customer);
    if (has("status") && status)       sp.set("status", status);
    if (has("days"))                   sp.set("days_ahead", days || "30");
    return sp.toString();
  }

  async function run() {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/reports/${report}?${qs("json")}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? t("common.error")); setResult(null); }
      else setResult(json as Result);
    } finally {
      setLoading(false);
    }
  }

  async function download(format: "xlsx" | "csv") {
    setDownloading(format); setError(null);
    try {
      const res = await fetch(`/api/reports/${report}?${qs(format)}`);
      if (!res.ok) { setError(t("common.error")); return; }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${report}.${format}`;
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  function selectReport(key: string) {
    setReport(key); setResult(null); setStatus("");
  }

  const inputCls  = "border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none transition";
  const field     = (label: string, control: React.ReactNode) => (
    <label className="text-sm">
      <div className="text-gray-500 mb-1">{label}</div>
      {control}
    </label>
  );
  const select = (value: string, set: (v: string) => void, options: { value: string | number; label: string }[], all: string) => (
    <select value={value} onChange={e => set(e.target.value)} className={`${inputCls} max-w-[16rem]`}>
      <option value="">{all}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("reports.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("reports.subtitle")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        {GROUPS.map(g => (
          <div key={g.label} className="border border-[#c8d3e8] rounded-xl p-3">
            <div className="text-xs font-semibold uppercase text-gray-400 mb-2">{t(`reports.${g.label}`)}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.keys.map(k => (
                <button
                  key={k}
                  onClick={() => selectReport(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                    report === k ? "bg-brand text-white border-brand" : "border-[#dde3ef] text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {REPORT_TITLES[lang][k]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-[#c8d3e8] rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        {has("period") && <>
          {field(t("reports.dateFrom"), <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />)}
          {field(t("reports.dateTo"),   <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className={inputCls} />)}
        </>}
        {has("days") && field(t("reports.daysAhead"),
          <input type="number" min={1} max={3650} value={days} onChange={e => setDays(e.target.value)} className={`${inputCls} w-24`} />)}
        {has("warehouse") && field(t("reports.warehouse"),
          select(warehouse, setWarehouse, (catalog?.warehouses ?? []).map(o => ({ value: o.id, label: o.name })), t("reports.all")))}
        {has("item") && field(t("reports.item"),
          select(item, setItem, (catalog?.items ?? []).map(o => ({ value: o.id, label: (lang === "ru" ? o.name_ru || o.name_ro : o.name_ro || o.name_ru) })), t("reports.all")))}
        {has("supplier") && field(t("reports.supplier"),
          select(supplier, setSupplier, (catalog?.suppliers ?? []).map(o => ({ value: o.id, label: o.name })), t("reports.all")))}
        {has("customer") && field(t("reports.customer"),
          select(customer, setCustomer, (catalog?.customers ?? []).map(o => ({ value: o.id, label: o.name })), t("reports.all")))}
        {has("status") && field(t("reports.status"),
          select(status, setStatus, (def?.statuses ?? []).map(s => ({ value: s, label: VALUE_LABELS[lang].status[s] ?? s })), t("reports.all")))}

        <div className="flex gap-2 ml-auto">
          <button
            onClick={run}
            disabled={loading || !catalog}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            <Play className="w-4 h-4" />{loading ? t("common.loading") : t("reports.generate")}
          </button>
          <button
            onClick={() => download("xlsx")}
            disabled={!!downloading || !catalog}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />{downloading === "xlsx" ? "…" : "Excel"}
          </button>
          <button
            onClick={() => download("csv")}
            disabled={!!downloading || !catalog}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#dde3ef] text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <FileText className="w-4 h-4" />{downloading === "csv" ? "…" : "CSV"}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {result ? (
        <>
          <div className="flex items-baseline justify-between mb-2 gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{result.title}</h2>
            <span className="text-sm text-gray-400">
              {t("reports.rows")}: {result.total}
              {result.truncated && ` · ${t("reports.truncated").replace("{n}", String(result.rows.length))}`}
            </span>
          </div>
          <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  {result.columns.map(c => (
                    <TableHead key={c.key} className={`whitespace-nowrap ${NUMERIC.includes(c.type) ? "text-right" : ""}`}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={result.columns.length} className="text-center text-gray-400 py-6">{t("reports.empty")}</TableCell>
                  </TableRow>
                ) : result.rows.map((r, i) => (
                  <TableRow key={i}>
                    {result.columns.map(c => (
                      <TableCell key={c.key} className={`text-sm whitespace-nowrap ${NUMERIC.includes(c.type) ? "text-right tabular-nums" : ""}`}>
                        {fmtCell(r[c.key], c.type)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {result.totals && result.rows.length > 0 && (
                  <TableRow className="bg-gray-50 font-semibold">
                    {result.columns.map((c, i) => (
                      <TableCell key={c.key} className={`text-sm whitespace-nowrap ${NUMERIC.includes(c.type) ? "text-right tabular-nums" : ""}`}>
                        {i === 0 ? t("reports.total") : c.key in result.totals! ? fmtCell(result.totals![c.key], c.type) : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {result.truncated && <p className="text-xs text-gray-400 mt-2">{t("reports.truncatedHint")}</p>}
        </>
      ) : (
        <div className="border border-dashed border-[#c8d3e8] rounded-xl p-8 text-center text-sm text-gray-400">
          {t("reports.hint")}
        </div>
      )}
    </div>
  );
}
