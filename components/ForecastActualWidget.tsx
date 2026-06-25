"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/locale";

interface ManagerStat {
  username: string; first_name: string | null; last_name: string | null;
  revenue_cur: number;
}

interface ManagerTarget {
  username: string; month: number; year: number; target_amount: number;
}

function fmtMdl(n: number) {
  return new Intl.NumberFormat("ru-MD", { maximumFractionDigits: 0 }).format(n) + " MDL";
}

function ProgressBar({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const cls  = pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

export default function ForecastActualWidget() {
  const t = useT();
  const [stats,   setStats]   = useState<ManagerStat[]>([]);
  const [targets, setTargets] = useState<ManagerTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    Promise.all([
      fetch("/api/manager-stats").then(r => r.json()),
      fetch(`/api/manager-targets?year=${year}`).then(r => r.json()),
    ]).then(([s, tg]) => {
      setStats((s as ManagerStat[]).filter(m => m.revenue_cur > 0 || getTarget(tg as ManagerTarget[], m.username) > 0));
      setTargets(tg as ManagerTarget[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  function getTarget(tg: ManagerTarget[], username: string) {
    return tg.find(t => t.username === username && t.month === month && t.year === year)?.target_amount ?? 0;
  }

  function displayName(m: ManagerStat) {
    if (m.first_name || m.last_name) return [m.first_name, m.last_name].filter(Boolean).join(" ");
    return m.username;
  }

  if (loading) return <div className="text-sm text-gray-400 py-6 text-center">{t("common.loading")}</div>;

  const totalActual = stats.reduce((s, m) => s + m.revenue_cur, 0);
  const totalTarget = stats.reduce((s, m) => s + getTarget(targets, m.username), 0);
  const overallPct  = totalTarget > 0 ? Math.min(100, Math.round((totalActual / totalTarget) * 100)) : 0;

  const monthNames = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

  return (
    <div className="space-y-5">
      {/* Total summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-2xl font-bold text-violet-500">{overallPct}%</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Выполнение</div>
        </div>
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-xl font-bold text-gray-800 leading-tight">{fmtMdl(totalActual)}</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Факт</div>
        </div>
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-xl font-bold text-gray-400 leading-tight">{totalTarget > 0 ? fmtMdl(totalTarget) : "—"}</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">План</div>
        </div>
      </div>

      {/* Overall bar */}
      {totalTarget > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{monthNames[month - 1]} {year}</span>
            <span>{fmtMdl(totalActual)} / {fmtMdl(totalTarget)}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overallPct >= 100 ? "bg-emerald-400" : overallPct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-manager table */}
      {stats.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide">По менеджерам</div>
          {stats.map(m => {
            const target = getTarget(targets, m.username);
            return (
              <div key={m.username} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-28 truncate shrink-0">{displayName(m)}</span>
                <div className="flex-1">
                  <ProgressBar value={m.revenue_cur} target={target || m.revenue_cur} />
                </div>
                <span className="text-xs text-gray-500 w-24 text-right tabular-nums shrink-0">
                  {fmtMdl(m.revenue_cur)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {stats.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-4">{t("common.noData")}</div>
      )}
    </div>
  );
}
