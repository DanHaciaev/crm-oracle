"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Ban, CircleSlash } from "lucide-react";
import { useT, useLocale } from "@/lib/locale";

export type Lang = "ro" | "ru" | "en";
export function useLang(): Lang {
  const { locale } = useLocale();
  return locale === "ru" || locale === "en" ? locale : "ro";
}

export interface Option { id: number; name: string }
export interface Options { warehouses: Option[]; items: Option[]; suppliers: Option[] }

export const fmtKg = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtDate(v: string | null | undefined, withTime = false) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const day = d.toLocaleDateString("ru-RU");
  return withTime ? `${day} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : day;
}

// Fetch helper that refetches when `url` changes and exposes reload().
export function useFetch<T>(url: string | null) {
  const [data, setData]       = useState<T | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick]       = useState(0);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? String(r.status)); return j as T; })
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, tick]);
  return { data, error, loading, reload: () => setTick(x => x + 1) };
}

// Batch status: label + icon, never color alone.
export function BatchStatus({ status }: { status: string }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
    active:   { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    blocked:  { cls: "bg-red-50 text-red-700 border-red-200",             Icon: Ban },
    depleted: { cls: "bg-gray-100 text-gray-500 border-gray-200",         Icon: CircleSlash },
  };
  const c = cfg[status] ?? cfg.depleted;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`warehouse.status_${status}`)}
    </span>
  );
}

export function StatTile({ label, value, unit, hint, tone }: {
  label: string; value: string; unit?: string; hint?: string; tone?: "warn" | "bad";
}) {
  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 bg-white">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900"}`}>
        {value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

// One horizontal bar: single series, brand hue, value label in text ink,
// 4px rounded data end, native tooltip on hover.
export function Bar({ label, value, max, valueLabel, title, sub }: {
  label: string; value: number; max: number; valueLabel: string; title?: string; sub?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 py-1.5" title={title}>
      <div className="text-sm text-gray-700 truncate">{label}{sub && <div className="text-[11px] text-gray-400">{sub}</div>}</div>
      <div className="h-3 rounded-r bg-gray-100 overflow-hidden">
        <div className="h-full bg-brand rounded-r" style={{ width: `${pct}%`, minWidth: value > 0 ? 2 : 0 }} />
      </div>
      <div className="text-sm tabular-nums text-gray-700 text-right min-w-[7rem]">{valueLabel}</div>
    </div>
  );
}

export const inputCls = "border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none transition";

export function Select({ value, onChange, options, all }: {
  value: string; onChange: (v: string) => void; options: { value: string | number; label: string }[]; all: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} max-w-[14rem]`}>
      <option value="">{all}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
