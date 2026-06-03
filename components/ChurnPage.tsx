/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface ChurnItem {
  id: number; name: string;
  curr: number; prev: number; pct: number;
  last_date: string | null;
  tg_linked: boolean; app_user_id: number | null;
}

interface ChurnData {
  period: string; threshold: number;
  prev_from: string; prev_to: string;
  curr_from: string; curr_to: string;
  items: ChurnItem[];
}

function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function pctColor(pct: number) {
  if (pct <= -50) return "text-red-400 font-bold";
  if (pct <= -30) return "text-orange-400 font-semibold";
  if (pct <  0)   return "text-yellow-400";
  return "text-emerald-400";
}

export default function ChurnPage() {
  const t = useT();
  const [data, setData]           = useState<ChurnData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [period, setPeriod]       = useState("30d");
  const [threshold, setThreshold] = useState(30);
  const [sending, setSending]     = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setData(null);
    const p   = new URLSearchParams({ period, threshold: String(threshold) });
    const res  = await fetch(`/api/churn?${p}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError((json as { error?: string }).error ?? t("common.error"));
    else         setData(json as ChurnData);
    setLoading(false);
  }, [period, threshold, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function sendTelegram(item: ChurnItem) {
    if (!item.tg_linked || !item.app_user_id) return;
    setSending(item.id);
    window.open(`/inbox`, "_blank");
    setSending(null);
  }

  const items    = data?.items ?? [];
  const critical = items.filter((i) => i.pct <= -50).length;
  const high     = items.filter((i) => i.pct > -50 && i.pct <= -30).length;
  const medium   = items.filter((i) => i.pct > -30).length;

  function riskLabel(pct: number) {
    if (pct <= -50) return { label: t("churn.risk.critical"), cls: "border-red-500/50 text-red-400 bg-red-500/10" };
    if (pct <= -30) return { label: t("churn.risk.high"),     cls: "border-orange-500/50 text-orange-400 bg-orange-500/10" };
    return             { label: t("churn.risk.medium"),        cls: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" };
  }

  const PERIODS = [
    { v: "7d",  l: t("dashboard.periods.d7") },
    { v: "30d", l: t("dashboard.periods.d30") },
    { v: "90d", l: t("dashboard.periods.d90") },
    { v: "ytd", l: t("churn.ytd") },
  ];

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col acts:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("churn.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("churn.subtitle")} ({threshold}%)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-3 py-1.5 rounded-md border text-sm transition ${
                period === p.v ? "border-gray-800 bg-gray-900 text-white" : "border-gray-800 text-gray-500 hover:bg-gray-100"
              }`}>
              {p.l}
            </button>
          ))}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{t("churn.threshold")}</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              className="border border-gray-800 bg-white rounded-lg px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition">
              <option value={15}>-15%</option>
              <option value={20}>-20%</option>
              <option value={30}>-30%</option>
              <option value={50}>-50%</option>
            </select>
          </div>
        </div>
      </div>

      {data && (
        <div className="text-sm text-gray-500 mb-5">
          {t("churn.current")}: {fmtDate(data.curr_from)} — {fmtDate(data.curr_to)}{" "}
          vs {t("churn.previous")}: {fmtDate(data.prev_from)} — {fmtDate(data.prev_to)}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={t("churn.risk.criticalFull")} value={String(critical)} cls="text-red-400" />
        <StatCard label={t("churn.risk.highFull")}     value={String(high)}     cls="text-orange-400" />
        <StatCard label={t("churn.risk.mediumFull")}   value={String(medium)}   cls="text-yellow-400" />
      </div>

      <div className="border border-gray-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("customers.title").toUpperCase()}</TableHead>
              <TableHead>{t("churn.riskLevel").toUpperCase()}</TableHead>
              <TableHead className="text-center">{t("churn.prevPeriod").toUpperCase()}</TableHead>
              <TableHead className="text-center">{t("churn.currPeriod").toUpperCase()}</TableHead>
              <TableHead className="text-center">{t("churn.change").toUpperCase()}</TableHead>
              <TableHead>{t("churn.lastOrder").toUpperCase()}</TableHead>
              <TableHead className="text-center">TG</TableHead>
              <TableHead className="text-center">{t("churn.action").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-10">{error}</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10">
                {t("churn.noBelowThreshold")} {threshold}% {t("churn.notFound")}
              </TableCell></TableRow>
            ) : items.map((item) => {
              const risk = riskLabel(item.pct);
              return (
                <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="font-medium">
                    <Link href={`/customers/${item.id}`}
                      className="hover:text-gray-900 transition underline underline-offset-2 decoration-gray-300">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium border ${risk.cls}`}>
                      {risk.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums text-gray-500">{fmtMoney(item.prev)} MDL</TableCell>
                  <TableCell className="text-center font-mono tabular-nums">{fmtMoney(item.curr)} MDL</TableCell>
                  <TableCell className={`text-center font-mono tabular-nums ${pctColor(item.pct)}`}>
                    {item.pct > 0 ? "+" : ""}{item.pct}%
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtDate(item.last_date)}</TableCell>
                  <TableCell className="text-center">
                    {item.tg_linked
                      ? <span className="text-emerald-400 text-sm">✓</span>
                      : <span className="text-gray-400 text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/customers/${item.id}?tab=sales`}
                        className="px-2.5 py-1 text-sm rounded-md border border-gray-800 hover:bg-gray-100 transition text-gray-700">
                        {t("sales.title")}
                      </Link>
                      {item.tg_linked && (
                        <button onClick={() => sendTelegram(item)} disabled={sending === item.id}
                          className="px-2.5 py-1 text-sm rounded-md border border-sky-700 text-sky-400 hover:bg-sky-950/50 transition disabled:opacity-40">
                          {sending === item.id ? "..." : "TG"}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {items.length > 0 && !loading && (
        <div className="mt-3 text-center text-sm text-gray-400">
          {t("churn.riskyCount")}: {items.length}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="border border-gray-800 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
