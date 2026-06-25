/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

// ── Period churn types ──────────────────────────────────────────────────────
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

// ── Score types ─────────────────────────────────────────────────────────────
type ChurnLevel = "safe" | "at_risk" | "high_risk" | "critical";
interface ScoreItem {
  id: number; name: string;
  score: number; level: ChurnLevel;
  days_since: number; avg_cycle: number;
  order_count: number; ltv: number;
  curr_90: number; prev_90: number;
  last_order: string | null;
  tg_linked: boolean; app_user_id: number | null;
  explain: string | null;
}
interface ScoreData {
  summary: { critical: number; high_risk: number; at_risk: number; safe: number; total: number };
  items: ScoreItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

const LEVEL_CFG: Record<ChurnLevel, { label: string; bar: string; badge: string }> = {
  critical:  { label: "Критический", bar: "bg-red-500",    badge: "border-red-500/50 text-red-400 bg-red-500/10" },
  high_risk: { label: "Высокий",     bar: "bg-orange-400", badge: "border-orange-500/50 text-orange-400 bg-orange-500/10" },
  at_risk:   { label: "Средний",     bar: "bg-yellow-400", badge: "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" },
  safe:      { label: "Норма",       bar: "bg-emerald-400",badge: "border-emerald-500/50 text-emerald-600 bg-emerald-500/10" },
};

function StatCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const level: ChurnLevel = score >= 75 ? "critical" : score >= 50 ? "high_risk" : score >= 25 ? "at_risk" : "safe";
  return (
    <div className="flex items-center gap-2 min-w-30">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${LEVEL_CFG[level].bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums font-mono w-8 text-right text-gray-600">{score}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ChurnPage() {
  const t = useT();
  const [tab, setTab] = useState<"period" | "score">("period");

  // --- Period tab state ---
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

  useEffect(() => { if (tab === "period") fetchData(); }, [fetchData, tab]);

  // --- Score tab state ---
  const [scoreData, setScoreData]     = useState<ScoreData | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError]   = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<ChurnLevel | "all">("all");

  const fetchScore = useCallback(async () => {
    setScoreLoading(true); setScoreError(null);
    const res  = await fetch("/api/churn/score");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setScoreError((json as { error?: string }).error ?? t("common.error"));
    else         setScoreData(json as ScoreData);
    setScoreLoading(false);
  }, [t]);

  useEffect(() => { if (tab === "score" && !scoreData) fetchScore(); }, [tab, scoreData, fetchScore]);

  // ── Period tab helpers ─────────────────────────────────────────────────────
  const items    = data?.items ?? [];
  const critical = items.filter((i) => i.pct <= -50).length;
  const high     = items.filter((i) => i.pct > -50 && i.pct <= -30).length;
  const medium   = items.filter((i) => i.pct > -30).length;

  function riskLabel(pct: number) {
    if (pct <= -50) return { label: t("churn.risk.critical"), cls: "border-red-500/50 text-red-400 bg-red-500/10" };
    if (pct <= -30) return { label: t("churn.risk.high"),     cls: "border-orange-500/50 text-orange-400 bg-orange-500/10" };
    return             { label: t("churn.risk.medium"),        cls: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" };
  }

  async function sendTelegram(item: ChurnItem) {
    if (!item.tg_linked || !item.app_user_id) return;
    setSending(item.id);
    window.open(`/inbox`, "_blank");
    setSending(null);
  }

  const PERIODS = [
    { v: "7d",  l: t("dashboard.periods.d7") },
    { v: "30d", l: t("dashboard.periods.d30") },
    { v: "90d", l: t("dashboard.periods.d90") },
    { v: "ytd", l: t("churn.ytd") },
  ];

  const scoreItems = (scoreData?.items ?? []).filter((s) => levelFilter === "all" || s.level === levelFilter);

  return (
    <div className="p-4 sm:p-8 space-y-5">

      {/* Header + tab switcher */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("churn.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("churn.subtitle")}</p>
        </div>
        <div className="flex rounded-xl border border-[#c8d3e8] overflow-hidden text-sm">
          <button onClick={() => setTab("period")}
            className={`px-4 py-2 transition ${tab === "period" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
            {t("churn.tabPeriod")}
          </button>
          <button onClick={() => setTab("score")}
            className={`px-4 py-2 transition ${tab === "score" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
            AI Score
          </button>
        </div>
      </div>

      {/* ── PERIOD TAB ─────────────────────────────────────────────────────── */}
      {tab === "period" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {PERIODS.map((p) => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`px-3 py-1.5 rounded-md border text-sm transition ${
                  period === p.v ? "border-[#c8d3e8] bg-gray-900 text-white" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-100"
                }`}>
                {p.l}
              </button>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t("churn.threshold")}</span>
              <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                className="border border-[#c8d3e8] bg-white rounded-lg px-2 py-1.5 text-sm text-gray-900 outline-none">
                <option value={15}>-15%</option>
                <option value={20}>-20%</option>
                <option value={30}>-30%</option>
                <option value={50}>-50%</option>
              </select>
            </div>
          </div>

          {data && (
            <div className="text-sm text-gray-500">
              {t("churn.current")}: {fmtDate(data.curr_from)} — {fmtDate(data.curr_to)}{" "}
              vs {t("churn.previous")}: {fmtDate(data.prev_from)} — {fmtDate(data.prev_to)}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label={t("churn.risk.criticalFull")} value={String(critical)} cls="text-red-400" />
            <StatCard label={t("churn.risk.highFull")}     value={String(high)}     cls="text-orange-400" />
            <StatCard label={t("churn.risk.mediumFull")}   value={String(medium)}   cls="text-yellow-400" />
          </div>

          <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
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
                        <Link href={`/customers/${item.id}`} className="hover:text-gray-900 transition underline underline-offset-2 decoration-gray-300">
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
                        {item.tg_linked ? <span className="text-emerald-400 text-sm">✓</span> : <span className="text-gray-400 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/customers/${item.id}?tab=sales`}
                            className="px-2.5 py-1 text-sm rounded-md border border-[#c8d3e8] hover:bg-gray-100 transition text-gray-700">
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
            <div className="text-center text-sm text-gray-400">{t("churn.riskyCount")}: {items.length}</div>
          )}
        </>
      )}

      {/* ── SCORE TAB ──────────────────────────────────────────────────────── */}
      {tab === "score" && (
        <>
          {scoreLoading && <div className="py-10 text-center text-sm text-gray-400">{t("common.loading")}</div>}
          {scoreError   && <div className="text-sm text-red-500 border border-red-300 rounded-xl px-4 py-3">{scoreError}</div>}

          {scoreData && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Критический"  value={String(scoreData.summary.critical)}  cls="text-red-400" />
                <StatCard label="Высокий риск" value={String(scoreData.summary.high_risk)} cls="text-orange-400" />
                <StatCard label="Под наблюдением" value={String(scoreData.summary.at_risk)}   cls="text-yellow-500" />
                <StatCard label="В норме"      value={String(scoreData.summary.safe)}      cls="text-emerald-500" />
              </div>

              {/* Level filter */}
              <div className="flex gap-2 flex-wrap text-sm">
                {(["all", "critical", "high_risk", "at_risk", "safe"] as const).map((lv) => (
                  <button key={lv} onClick={() => setLevelFilter(lv)}
                    className={`px-3 py-1 rounded-full border transition ${
                      levelFilter === lv
                        ? "bg-gray-900 text-white border-gray-900"
                        : "border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}>
                    {lv === "all" ? "Все" : LEVEL_CFG[lv].label}
                    {lv !== "all" && <span className="ml-1 opacity-70">({scoreData.summary[lv]})</span>}
                  </button>
                ))}
                <button onClick={fetchScore} className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition">
                  ↻ Обновить
                </button>
              </div>

              {/* Score list */}
              <div className="border border-[#c8d3e8] rounded-xl divide-y divide-gray-100">
                {scoreItems.length === 0 && (
                  <div className="py-10 text-center text-sm text-gray-400">Нет клиентов в этой категории</div>
                )}
                {scoreItems.map((s) => {
                  const cfg = LEVEL_CFG[s.level];
                  return (
                    <div key={s.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link href={`/customers/${s.id}`} className="font-medium text-gray-900 hover:underline">
                          {s.name}
                        </Link>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] border ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <div className="flex-1 min-w-35">
                          <ScoreBar score={s.score} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                        <span>Дней без заказа: <b className="text-gray-700">{s.days_since}</b></span>
                        <span>Цикл: <b className="text-gray-700">{s.avg_cycle} д.</b></span>
                        <span>90 дн.: <b className="text-gray-700">{fmtMoney(s.curr_90)}</b> MDL</span>
                        <span>пред. 90 дн.: <b className="text-gray-700">{fmtMoney(s.prev_90)}</b> MDL</span>
                        <span>LTV: <b className="text-gray-700">{fmtMoney(s.ltv)}</b> MDL</span>
                        <span>Последний заказ: <b className="text-gray-700">{fmtDate(s.last_order)}</b></span>
                      </div>

                      {s.explain && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 italic">
                          AI: {s.explain}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Link href={`/customers/${s.id}`}
                          className="text-xs px-2.5 py-1 border border-gray-300 rounded-md hover:bg-gray-50 transition text-gray-600">
                          Карточка
                        </Link>
                        <Link href={`/customers/${s.id}?tab=sales`}
                          className="text-xs px-2.5 py-1 border border-gray-300 rounded-md hover:bg-gray-50 transition text-gray-600">
                          Продажи
                        </Link>
                        {s.tg_linked && (
                          <Link href="/inbox"
                            className="text-xs px-2.5 py-1 border border-sky-300 text-sky-600 rounded-md hover:bg-sky-50 transition">
                            TG →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
