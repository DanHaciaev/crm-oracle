/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
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

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationBell() {
  const [data, setData]   = useState<NotifData | null>(null);
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);
  const router            = useRouter();
  const t                 = useT();

  async function load() {
    const res  = await fetch("/api/notifications");
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const total = data?.total ?? 0;

  function navigate(path: string) {
    setOpen(false);
    router.push(path);
  }

  const PRIORITY_LABEL: Record<string, string> = {
    urgent: t("priorities.urgent"),
    high:   t("priorities.high"),
    normal: t("priorities.normal"),
    low:    t("priorities.low"),
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition"
        title={t("notifications.title")}
      >
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{t("notifications.title")}</span>
            {total > 0 && <span className="text-sm text-gray-400">{total} {t("notifications.unread")}</span>}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {(!data || total === 0) && (
              <p className="text-sm text-gray-400 text-center py-8">{t("notifications.empty")}</p>
            )}

            {(data?.overdue_tasks.length ?? 0) > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-800">
                  {t("notifications.overdueTasks")}
                </div>
                {data!.overdue_tasks.map((task) => (
                  <button key={task.id} onClick={() => navigate("/tasks")}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-800 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-gray-900 leading-tight">{task.title}</span>
                      <span className="text-[10px] text-red-500 shrink-0 mt-0.5">{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {task.customer_name ?? "—"} · {t("notifications.until")} {fmtDate(task.due_date)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(data?.unread_messages.length ?? 0) > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-800">
                  {t("notifications.unreadMessages")}
                </div>
                {data!.unread_messages.map((m) => (
                  <button key={m.app_user_id} onClick={() => navigate("/inbox")}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-800 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-900">{m.customer_name ?? `#${m.app_user_id}`}</span>
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {m.count}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">{t("notifications.telegram")}</div>
                  </button>
                ))}
              </div>
            )}

            {(data?.recent_automations.length ?? 0) > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-800">
                  {t("notifications.recentAutomations")}
                </div>
                {data!.recent_automations.map((a) => (
                  <button key={a.id} onClick={() => navigate("/automations")}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-800 last:border-0">
                    <div className="text-sm text-gray-900">{a.rule_name}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {a.customer_name ?? "—"} · {fmtDate(a.fired_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
