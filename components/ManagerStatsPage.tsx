/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/locale";

interface ManagerStat {
  id: number; username: string;
  first_name: string | null; last_name: string | null; role: string;
  total_tasks: number; open_tasks: number; done_tasks: number; overdue_tasks: number;
  total_acts: number; acts_7d: number; acts_30d: number;
  calls: number; meetings: number; notes: number;
}

function displayName(m: ManagerStat) {
  if (m.first_name || m.last_name)
    return [m.first_name, m.last_name].filter(Boolean).join(" ");
  return m.username;
}

function Bar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums w-6 text-center">{value}</span>
    </div>
  );
}

export default function ManagerStatsPage() {
  const t = useT();
  const [stats, setStats]     = useState<ManagerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/manager-stats");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setStats(data as ManagerStat[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxActs  = Math.max(...stats.map(s => s.total_acts),  1);
  const maxTasks = Math.max(...stats.map(s => s.total_tasks), 1);
  const maxActs7 = Math.max(...stats.map(s => s.acts_7d),     1);

  if (loading) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;
  if (error)   return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("managers.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("managers.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{stats.length}</div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.employees")}</div>
        </div>
        <div className="border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">
            {stats.reduce((s, m) => s + m.total_acts, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.totalActs")}</div>
        </div>
        <div className="border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-sky-400">
            {stats.reduce((s, m) => s + m.acts_7d, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.last7days")}</div>
        </div>
        <div className="border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">
            {stats.reduce((s, m) => s + m.open_tasks, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">{t("managers.openTasks")}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((m) => (
          <div key={m.id} className="border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{displayName(m)}</div>
                <div className="text-sm text-gray-400 font-mono">{m.username}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                m.role === "admin"
                  ? "border-amber-500/50 text-amber-500 bg-amber-50"
                  : "border-gray-800 text-gray-500"
              }`}>
                {m.role === "admin" ? t("common.admin") : t("common.manager")}
              </span>
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
