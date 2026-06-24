/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/locale";

interface OverdueTask {
  id: number; title: string; customer_name: string | null;
  due_date: string | null; priority: string;
}
interface UnreadMessage {
  app_user_id: number; customer_id: number | null;
  customer_name: string | null; count: number;
}
interface RecentAutomation {
  id: number; rule_name: string; customer_name: string | null;
  result: string; fired_at: string | null;
}
interface NotifData {
  total: number;
  overdue_tasks:       OverdueTask[];
  unread_messages:     UnreadMessage[];
  recent_automations:  RecentAutomation[];
}

const DISMISSED_KEY      = "crm_dismissed_tasks";
const DISMISSED_AUTO_KEY = "crm_dismissed_automations";

function getDismissed(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as number[]); }
  catch { return new Set(); }
}
function dismissTask(id: number) {
  const s = getDismissed(); s.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s]));
}
function getDismissedAuto(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_AUTO_KEY) ?? "[]") as number[]); }
  catch { return new Set(); }
}
function dismissAuto(id: number) {
  const s = getDismissedAuto(); s.add(id);
  localStorage.setItem(DISMISSED_AUTO_KEY, JSON.stringify([...s]));
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationBell() {
  const [data,          setData]          = useState<NotifData | null>(null);
  const [open,          setOpen]          = useState(false);
  const [dismissed,     setDismissed]     = useState<Set<number>>(new Set());
  const [dismissedAuto, setDismissedAuto] = useState<Set<number>>(new Set());
  const ref    = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t      = useT();

  const load = useCallback(async (markRead = false) => {
    if (markRead) {
      // await so the DB update completes before we re-fetch counts
      await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => null);
    }
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    setDismissed(getDismissed());
    setDismissedAuto(getDismissedAuto());
    load();
    const interval = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      // On open: mark messages as read + fresh fetch
      load(true);
    }
  }

  function navigate(path: string) {
    setOpen(false);
    router.push(path);
    // Re-fetch after navigation gives time to update
    setTimeout(() => load(), 1200);
  }

  function handleDismissTask(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    dismissTask(id);
    setDismissed(getDismissed());
  }

  function handleDismissAuto(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    dismissAuto(id);
    setDismissedAuto(getDismissedAuto());
  }

  const PRIORITY_LABEL: Record<string, string> = {
    urgent: t("priorities.urgent"),
    high:   t("priorities.high"),
    normal: t("priorities.normal"),
    low:    t("priorities.low"),
  };

  const visibleTasks   = (data?.overdue_tasks ?? []).filter(tk => !dismissed.has(tk.id));
  const unreadMessages = data?.unread_messages ?? [];
  const automations    = (data?.recent_automations ?? []).filter(a => !dismissedAuto.has(a.id));

  const badgeCount =
    visibleTasks.length +
    unreadMessages.reduce((s, m) => s + m.count, 0) +
    automations.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition"
        title={t("notifications.title")}
      >
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {badgeCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-[#c8d3e8] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#c8d3e8] flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{t("notifications.title")}</span>
            {badgeCount > 0 && (
              <button
                onClick={() => {
                  load(true);
                  const taskIds = (data?.overdue_tasks ?? []).map(t => t.id);
                  const autoIds = (data?.recent_automations ?? []).map(a => a.id);
                  setDismissed(new Set(taskIds));
                  setDismissedAuto(new Set(autoIds));
                  localStorage.setItem(DISMISSED_KEY,      JSON.stringify(taskIds));
                  localStorage.setItem(DISMISSED_AUTO_KEY, JSON.stringify(autoIds));
                }}
                className="text-xs text-[#516895] hover:underline"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {badgeCount === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">{t("notifications.empty")}</p>
            )}

            {/* Overdue tasks */}
            {visibleTasks.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-[#c8d3e8]">
                  {t("notifications.overdueTasks")}
                </div>
                {visibleTasks.map((task) => (
                  <div key={task.id} className="group flex items-start border-b border-[#c8d3e8] last:border-0 hover:bg-gray-50 transition">
                    <button
                      onClick={() => navigate("/tasks")}
                      className="flex-1 text-left px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-gray-900 leading-tight">{task.title}</span>
                        <span className="text-[10px] text-red-500 shrink-0 mt-0.5">{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {task.customer_name ?? "—"} · {t("notifications.until")} {fmtDate(task.due_date)}
                      </div>
                    </button>
                    <button
                      onClick={(e) => handleDismissTask(e, task.id)}
                      className="shrink-0 px-2 py-3 text-gray-200 hover:text-gray-500 transition opacity-0 group-hover:opacity-100"
                      title="Скрыть"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Unread messages */}
            {unreadMessages.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-[#c8d3e8]">
                  {t("notifications.unreadMessages")}
                </div>
                {unreadMessages.map((m) => (
                  <button key={m.app_user_id} onClick={() => navigate("/inbox")}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-[#c8d3e8] last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-900">{m.customer_name ?? `#${m.app_user_id}`}</span>
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {m.count}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{t("notifications.telegram")}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Automations */}
            {automations.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-[#c8d3e8]">
                  {t("notifications.recentAutomations")}
                </div>
                {automations.map((a) => (
                  <div key={a.id} className="group flex items-start border-b border-[#c8d3e8] last:border-0 hover:bg-gray-50 transition">
                    <button onClick={() => navigate("/broadcasts")}
                      className="flex-1 text-left px-4 py-3">
                      <div className="text-sm text-gray-900">{a.rule_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {a.customer_name ?? "—"} · {fmtDate(a.fired_at)}
                      </div>
                    </button>
                    <button
                      onClick={(e) => handleDismissAuto(e, a.id)}
                      className="shrink-0 px-2 py-3 text-gray-200 hover:text-gray-500 transition opacity-0 group-hover:opacity-100"
                      title="Скрыть"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
