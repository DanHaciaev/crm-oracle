"use client";

import { useEffect, useState } from "react";

interface Event {
  id:         number;
  event_type: string;
  payload:    string | null;
  actor_id:   number | null;
  actor_name: string | null;
  created_at: string | null;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TYPE_LABEL: Record<string, string> = {
  start:            "🔘 /start без токена",
  start_with_token: "🔑 /start с токеном",
  linked:           "✅ привязан к клиенту",
  unlinked:         "🔓 отвязан",
  blocked:          "🚫 заблокирован",
  unblocked:        "♻️ разблокирован",
  message_in:       "💬 входящее сообщение",
};

export default function AppUserEventsModal({ appUserId, title, onClose }: {
  appUserId: number; title: string; onClose: () => void;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res  = await fetch(`/api/app-users/${appUserId}/events`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
      else         setEvents(data as Event[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUserId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">Журнал событий</h2>
            <p className="text-sm text-gray-400 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">×</button>
        </div>

        <div className="p-6 overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">Загрузка...</div>
          ) : error ? (
            <div className="text-sm text-red-500 py-6 text-center">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">Пока пусто</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="border border-zinc-800 rounded-lg p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{TYPE_LABEL[e.event_type] ?? e.event_type}</span>
                    <span className="text-xs text-gray-500">{fmtDate(e.created_at)}</span>
                  </div>
                  {e.payload && <div className="text-xs text-gray-500 mt-1 font-mono break-all">{e.payload}</div>}
                  {e.actor_name && <div className="text-xs text-gray-500 mt-1">от: @{e.actor_name}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
