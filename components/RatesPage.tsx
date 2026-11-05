"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Download, Info, Minus } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { inputCls, useFetch } from "@/components/warehouse/shared";

interface Rates {
  currencies: string[];
  days: Record<string, number | string>[];
  latest: Record<string, { rate: number; date: string; prev: number | null; change: number | null }>;
}

const r4 = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Change vs the previous day: arrow + signed value. Neutral ink on purpose —
// a stronger EUR is good for EUR sales and bad for EUR purchases.
function Change({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-300">—</span>;
  if (Math.abs(v) < 0.00005) return <span className="inline-flex items-center gap-0.5 text-gray-400"><Minus className="w-3 h-3" />0</span>;
  const up = v > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-gray-600">
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{up ? "+" : "−"}{r4(Math.abs(v))}
    </span>
  );
}

// Official BNM rates (X → MDL), loaded daily by DIPP FRUICT and/or the CRM's
// own cron; admins can load a day manually.
export default function RatesPage() {
  const t = useT();
  const { user } = useAuth();
  const canLoad = can(user?.permissions, "settings", "edit");
  const { data, error, reload } = useFetch<Rates>("/api/rates");
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState("EUR");
  const [loadDate, setLoadDate] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);

  // Each day's change vs the previous (older) row, per currency.
  const changes = useMemo(() => {
    const out: Record<string, Record<string, number | null>> = {};
    const days = data?.days ?? [];
    days.forEach((d, i) => {
      out[String(d.date)] = {};
      for (const c of data!.currencies) {
        const cur = d[c], prev = days[i + 1]?.[c];
        out[String(d.date)][c] = typeof cur === "number" && typeof prev === "number" ? cur - prev : null;
      }
    });
    return out;
  }, [data]);

  async function loadBnm() {
    setBusy(true);
    const res = await fetch("/api/rates/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: loadDate }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    toast.success(t("rates.loaded").replace("{date}", dmy(json.date)).replace("{list}", json.saved.map((s: { code: string; rate: number }) => `${s.code} ${r4(s.rate)}`).join(", ")));
    reload();
  }

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;

  const amt = Number(amount.replace(",", ".")) || 0;
  const rate = from === "MDL" ? 1 : data.latest[from]?.rate ?? 0;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("rates.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("rates.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        {data.currencies.map(c => {
          const l = data.latest[c];
          return (
            <div key={c} className="border border-[#c8d3e8] rounded-xl p-4 bg-white">
              <div className="text-xs text-gray-500">1 {c} = MDL</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{l ? r4(l.rate) : "—"}</div>
              <div className="text-xs mt-1 flex items-center gap-2"><Change v={l?.change ?? null} /><span className="text-gray-400">{l ? dmy(l.date) : ""}</span></div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <section className="border border-[#c8d3e8] rounded-xl p-4">
          <h2 className="font-semibold mb-3">{t("rates.converter")}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={`${inputCls} w-32 tabular-nums`} />
            <select value={from} onChange={e => setFrom(e.target.value)} className={inputCls}>
              {data.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-gray-400">=</span>
            <span className="text-lg font-semibold tabular-nums">{(amt * rate).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} MDL</span>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {data.currencies.filter(c => c !== from).map(c => {
              const rc = data.latest[c]?.rate; if (!rc || !rate) return null;
              return <span key={c} className="mr-3">= {((amt * rate) / rc).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} {c}</span>;
            })}
          </div>
        </section>

        {canLoad && (
          <section className="border border-[#c8d3e8] rounded-xl p-4">
            <h2 className="font-semibold mb-1">{t("rates.loadTitle")}</h2>
            <p className="text-xs text-gray-400 mb-3">{t("rates.loadHint")}</p>
            <div className="flex items-center gap-2">
              <input type="date" value={loadDate} max={iso(new Date())} onChange={e => setLoadDate(e.target.value)} className={inputCls} />
              <button onClick={loadBnm} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
                <Download className="w-4 h-4" />{busy ? t("common.loading") : t("rates.loadButton")}
              </button>
            </div>
          </section>
        )}
      </div>

      <h2 className="font-semibold mb-2">{t("rates.history")}</h2>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[55vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white">
            <TableRow>
              <TableHead>{t("rates.colDate")}</TableHead>
              {data.currencies.map(c => <TableHead key={c} className="text-right">{c}</TableHead>)}
              <TableHead className="hidden sm:table-cell">{t("rates.colSource")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.days.length === 0 ? (
              <TableRow><TableCell colSpan={data.currencies.length + 2} className="text-center text-gray-400 py-6">{t("rates.empty")}</TableCell></TableRow>
            ) : data.days.map(d => (
              <TableRow key={String(d.date)}>
                <TableCell className="text-sm whitespace-nowrap">{dmy(String(d.date))}</TableCell>
                {data.currencies.map(c => (
                  <TableCell key={c} className="text-right tabular-nums">
                    {typeof d[c] === "number" ? r4(d[c] as number) : "—"}
                    <div className="text-[11px]"><Change v={changes[String(d.date)]?.[c] ?? null} /></div>
                  </TableCell>
                ))}
                <TableCell className="hidden sm:table-cell text-xs text-gray-400">{String(d.source || "")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-3">{t("rates.retention")}</p>
    </div>
  );
}
