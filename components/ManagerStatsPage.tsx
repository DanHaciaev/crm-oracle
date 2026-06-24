/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/locale";
import { toast } from "sonner";

interface ManagerStat {
  id: number; username: string;
  first_name: string | null; last_name: string | null; role: string;
  total_tasks: number; open_tasks: number; done_tasks: number; overdue_tasks: number;
  total_acts: number; acts_7d: number; acts_30d: number;
  calls: number; meetings: number; notes: number;
  total_deals:   number;
  revenue_total: number;
  revenue_cur:   number;
  revenue_prev:  number;
}

interface ManagerTarget {
  username:      string;
  year:          number;
  month:         number;
  target_amount: number;
}

function displayName(m: ManagerStat) {
  if (m.first_name || m.last_name)
    return [m.first_name, m.last_name].filter(Boolean).join(" ");
  return m.username;
}

function fmtMdl(n: number) {
  return new Intl.NumberFormat("ru-MD", { maximumFractionDigits: 0 }).format(n) + " MDL";
}

function Bar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums w-6 text-center">{value}</span>
    </div>
  );
}

function ProgressBar({ value, target, cls }: { value: number; target: number; cls: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-gray-500 shrink-0 w-10 text-right">{pct}%</span>
    </div>
  );
}

// ─── Target edit cell ─────────────────────────────────────────────────────────

function TargetCell({
  username, year, month, initialValue, isAdmin, onSaved,
}: {
  username: string; year: number; month: number;
  initialValue: number; isAdmin: boolean;
  onSaved: (username: string, amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(String(initialValue || ""));
  const [saving,  setSaving]  = useState(false);

  async function save() {
    const amount = Number(value) || 0;
    setSaving(true);
    try {
      const res = await fetch("/api/manager-targets", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, year, month, target_amount: amount }),
      });
      if (res.ok) { toast.success("План сохранён"); onSaved(username, amount); }
      else toast.error("Ошибка сохранения");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(false); setEditing(false); }
  }

  if (!isAdmin) {
    return (
      <span className="text-sm text-gray-700">
        {initialValue > 0 ? fmtMdl(initialValue) : <span className="text-gray-300">—</span>}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-28 border border-[#c8d3e8] rounded px-2 py-0.5 text-sm outline-none focus:border-[#516895]"
        />
        <button
          onClick={save}
          disabled={saving}
          className="px-2 py-0.5 text-xs rounded bg-[#516895] text-white hover:bg-[#3d5070] disabled:opacity-50"
        >
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
      </div>
    );
  }

  if (initialValue > 0) {
    return (
      <button
        onClick={() => { setValue(String(initialValue)); setEditing(true); }}
        className="text-sm text-gray-800 font-medium hover:text-[#516895] group flex items-center gap-1.5 transition"
        title="Изменить план"
      >
        {fmtMdl(initialValue)}
        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-[#516895] transition">✏</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => { setValue(""); setEditing(true); }}
      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-[#c8d3e8] text-xs text-[#516895] hover:bg-[#516895]/10 hover:border-[#516895] transition"
    >
      <span>+</span> Задать план
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ManagerStatsPage() {
  const t = useT();

  const [stats,         setStats]         = useState<ManagerStat[]>([]);
  const [targets,       setTargets]       = useState<ManagerTarget[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const [statsRes, targetsRes, meRes] = await Promise.all([
      fetch("/api/manager-stats"),
      fetch(`/api/manager-targets?year=${year}`),
      fetch("/api/auth/me").catch(() => null),
    ]);

    if (!statsRes.ok) {
      const data = await statsRes.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? t("common.error"));
    } else {
      setStats(await statsRes.json() as ManagerStat[]);
    }

    if (targetsRes.ok) {
      setTargets(await targetsRes.json() as ManagerTarget[]);
    }

    if (meRes?.ok) {
      const me = await meRes.json().catch(() => ({})) as { role?: string };
      setIsAdmin(me.role === "admin");
    }

    setLoading(false);
  }, [year, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getTarget(username: string): number {
    return targets.find(tg => tg.username === username && tg.month === month && tg.year === year)?.target_amount ?? 0;
  }

  function handleTargetSaved(username: string, amount: number) {
    setTargets(prev => {
      const exists = prev.find(tg => tg.username === username && tg.year === year && tg.month === month);
      if (exists) return prev.map(tg => tg.username === username && tg.year === year && tg.month === month ? { ...tg, target_amount: amount } : tg);
      return [...prev, { username, year, month, target_amount: amount }];
    });
  }

  const maxActs  = Math.max(...stats.map(s => s.total_acts),  1);
  const maxTasks = Math.max(...stats.map(s => s.total_tasks), 1);
  const maxActs7 = Math.max(...stats.map(s => s.acts_7d),     1);

  const totalRevenueCur  = stats.reduce((s, m) => s + m.revenue_cur,  0);
  const totalRevenuePrev = stats.reduce((s, m) => s + m.revenue_prev, 0);

  if (loading) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;
  if (error)   return <div className="p-8 text-red-500">{error}</div>;

  const monthNames = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("managers.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("managers.subtitle")}</p>
        </div>
        {isAdmin && (
          <button
            onClick={async () => {
              setSendingReport(true);
              try {
                const res = await fetch("/api/cron/report");
                if (res.ok) toast.success(t("managers.reportSent"));
                else toast.error(t("managers.reportError"));
              } catch { toast.error(t("managers.reportError")); }
              finally { setSendingReport(false); }
            }}
            disabled={sendingReport}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-[#c8d3e8] rounded-xl text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            📊 {sendingReport ? "..." : t("managers.sendReport")}
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{stats.length}</div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.employees")}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">
            {stats.reduce((s, m) => s + m.total_acts, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.totalActs")}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-sky-400">
            {stats.reduce((s, m) => s + m.acts_7d, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.last7days")}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">
            {stats.reduce((s, m) => s + m.open_tasks, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.openTasks")}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-xl font-bold text-violet-500 leading-tight">
            {new Intl.NumberFormat("ru-MD", { maximumFractionDigits: 0 }).format(totalRevenueCur)}
          </div>
          <div className="text-xs text-gray-400 mt-1">{t("managers.revenueCur")}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-xl font-bold text-gray-500 leading-tight">
            {new Intl.NumberFormat("ru-MD", { maximumFractionDigits: 0 }).format(totalRevenuePrev)}
          </div>
          <div className="text-xs text-gray-400 mt-1">{t("managers.revenuePrev")}</div>
        </div>
      </div>

      {/* Sales plans table */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">{t("managers.planSection")} — {monthNames[month - 1]} {year}</h2>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#c8d3e8] bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide">{t("managers.manager")}</th>
                <th className="text-center px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide">{t("managers.deals")}</th>
                <th className="text-center px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide">{t("managers.revenueCur")}</th>
                <th className="text-center px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide">{t("managers.revenuePrev")}</th>
                <th className="px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide">{t("managers.target")}</th>
                <th className="px-4 py-2.5 font-semibold text-xs text-gray-500 tracking-wide w-40">{t("managers.targetProgress")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((m, i) => {
                const target = getTarget(m.username);
                return (
                  <tr key={m.id} className={`border-b border-[#c8d3e8] ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{displayName(m)}</div>
                      <div className="text-xs text-gray-400 font-mono">{m.username}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{m.total_deals}</td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      <span className={m.revenue_cur > 0 ? "text-violet-600 font-medium" : "text-gray-700"}>
                        {m.revenue_cur > 0 ? fmtMdl(m.revenue_cur) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 tabular-nums">
                      {m.revenue_prev > 0 ? fmtMdl(m.revenue_prev) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <TargetCell
                          username={m.username}
                          year={year}
                          month={month}
                          initialValue={target}
                          isAdmin={isAdmin}
                          onSaved={handleTargetSaved}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {target > 0 ? (
                        <ProgressBar
                          value={m.revenue_cur}
                          target={target}
                          cls={m.revenue_cur >= target ? "bg-emerald-400" : m.revenue_cur / target >= 0.5 ? "bg-amber-400" : "bg-red-400"}
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">{t("managers.targetNone")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manager cards */}
      <h2 className="text-base font-semibold text-gray-800 mb-3">{t("managers.activities")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((m) => (
          <div key={m.id} className="border border-[#c8d3e8] rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{displayName(m)}</div>
                <div className="text-sm text-gray-400 font-mono">{m.username}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                m.role === "admin"
                  ? "border-amber-500/50 text-amber-500 bg-amber-50"
                  : "border-[#c8d3e8] text-gray-500"
              }`}>
                {m.role === "admin" ? t("common.admin") : t("common.manager")}
              </span>
            </div>

            {/* Revenue summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 text-center">
                <div className="text-sm font-semibold text-violet-600 tabular-nums">
                  {m.revenue_cur > 0 ? new Intl.NumberFormat("ru-MD", { maximumFractionDigits: 0 }).format(m.revenue_cur) : "0"}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">MDL / {t("managers.revenueCur")}</div>
              </div>
              <div className="bg-gray-50 border border-[#c8d3e8] rounded-lg p-2 text-center">
                <div className="text-sm font-semibold text-gray-600 tabular-nums">{m.total_deals}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{t("managers.deals")}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">{t("managers.activities")}</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>{t("managers.total")}</span>
                  <span className="text-gray-800 font-mono">{m.total_acts}</span>
                </div>
                <Bar value={m.acts_7d} max={maxActs7} cls="bg-sky-500" />
                <div className="text-[10px] text-gray-400">
                  7 {t("common.days")}: {m.acts_7d} · 30 {t("common.days")}: {m.acts_30d}
                </div>
                <div className="flex gap-3 text-sm text-gray-500 mt-1">
                  <span>📞 {m.calls} {t("managers.calls")}</span>
                  <span>🤝 {m.meetings} {t("managers.meetings")}</span>
                  <span>📝 {m.notes} {t("managers.notes")}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">{t("managers.tasks")}</div>
              <Bar value={m.total_tasks} max={maxTasks} cls="bg-emerald-500" />
              <div className="flex gap-3 text-sm mt-2">
                <span className="text-amber-400">{m.open_tasks} {t("managers.open")}</span>
                <span className="text-emerald-400">{m.done_tasks} {t("managers.done")}</span>
                {m.overdue_tasks > 0 && (
                  <span className="text-red-400">{m.overdue_tasks} {t("managers.overdue")}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {stats.length === 0 && (
        <div className="text-center text-gray-400 py-16">{t("managers.noData")}</div>
      )}
    </div>
  );
}
