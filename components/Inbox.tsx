"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import CreateCustomerModal from "@/components/CreateCustomerModal";
import AppUserEventsModal from "@/components/AppUserEventsModal";

interface Thread {
  id:                number;
  telegram_chat_id:  number;
  telegram_username: string | null;
  first_name:        string | null;
  last_name:         string | null;
  status:            "pending" | "linked" | "blocked";
  customer_id:       number | null;
  customer_name:     string | null;
  last_message_at:   string | null;
  unread_count:      number;
  last_body:         string | null;
  last_dir:          string | null;
  last_file_type:    string | null;
}

interface Message {
  id:           number;
  direction:    "in" | "out";
  body:         string | null;
  file_id:      string | null;
  file_type:    string | null;
  status:       string;
  sent_by_id:   number | null;
  sent_by_name: string | null;
  created_at:   string | null;
}

type Filter = "all" | "pending" | "linked" | "blocked" | "unread" | "archived";

function fmtTime(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function fmtFullTime(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function threadTitle(t: Thread) {
  if (t.customer_name) return t.customer_name;
  if (t.telegram_username) return `@${t.telegram_username}`;
  const full = [t.first_name, t.last_name].filter(Boolean).join(" ");
  return full || `chat ${t.telegram_chat_id}`;
}

function previewText(t: Thread) {
  if (t.last_body) return t.last_body;
  if (t.last_file_type) return `[${t.last_file_type}]`;
  return "—";
}

export default function Inbox() {
  const [threads, setThreads]     = useState<Thread[]>([]);
  const [activeId, setActiveId]   = useState<number | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loadingThreads, setLT]   = useState(true);
  const [loadingMessages, setLM]  = useState(false);
  const [filter, setFilter]       = useState<Filter>("all");
  const [reply, setReply]         = useState("");
  const [sending, setSending]     = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [eventsModal, setEventsModal] = useState(false);

  const chatBottom = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId]
  );

  const inArchive = filter === "archived";

  // ---- fetch ----
  const fetchThreads = useCallback(async () => {
    const url = inArchive ? "/api/chat/threads?archived=1" : "/api/chat/threads";
    const res = await fetch(url);
    if (!res.ok) return;
    const data: Thread[] = await res.json();
    setThreads(data);
    setLT(false);
  }, [inArchive]);

  const fetchMessages = useCallback(async (appUserId: number) => {
    setLM(true);
    const res = await fetch(`/api/chat/${appUserId}/messages`);
    if (!res.ok) { setLM(false); return; }
    const data: Message[] = await res.json();
    setMessages(data);
    setLM(false);
  }, []);

  const markRead = useCallback(async (appUserId: number) => {
    await fetch(`/api/chat/${appUserId}/read`, { method: "PATCH" });
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // polling: threads каждые 5с, активный чат каждые 3с
  useEffect(() => {
    const i = setInterval(fetchThreads, 5000);
    return () => clearInterval(i);
  }, [fetchThreads]);

  useEffect(() => {
    if (activeId === null) return;
    fetchMessages(activeId);
    markRead(activeId);
    const i = setInterval(() => fetchMessages(activeId), 3000);
    return () => clearInterval(i);
  }, [activeId, fetchMessages, markRead]);

  // scroll to bottom on new messages
  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ---- actions ----
  async function send() {
    if (!active || !reply.trim()) return;
    setSending(true);
    const res = await fetch(`/api/chat/${active.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply.trim() }),
    });
    setSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    setReply("");
    fetchMessages(active.id);
    fetchThreads();
  }

  async function patchAppUser(action: string, extra: Record<string, unknown> = {}) {
    if (!active) return;
    const res = await fetch(`/api/app-users/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    // если архивировали/восстановили — текущий тред выпадет из выборки, чистим выбор
    if (action === "archive" || action === "unarchive") {
      setActiveId(null);
      setMessages([]);
    }
    fetchThreads();
  }

  async function hardDelete() {
    if (!active) return;
    if (!confirm("Удалить навсегда? Сообщения и события будут стёрты безвозвратно.")) return;
    const res = await fetch(`/api/app-users/${active.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    setActiveId(null);
    setMessages([]);
    fetchThreads();
  }

  // ---- filtering ----
  const filtered = useMemo(() => {
    if (filter === "archived") return threads; // уже отфильтровано на сервере
    if (filter === "all")      return threads;
    if (filter === "unread")   return threads.filter((t) => t.unread_count > 0);
    return threads.filter((t) => t.status === filter);
  }, [threads, filter]);

  const totalUnread = useMemo(
    () => threads.reduce((s, t) => s + (t.unread_count > 0 ? 1 : 0), 0),
    [threads]
  );

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* LEFT: threads */}
      <aside className="w-[360px] border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-bold">Inbox</h1>
            <span className="text-xs text-gray-500">{totalUnread > 0 ? `${totalUnread} непрочитанных` : "всё прочитано"}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Tab label="Все"          active={filter==="all"}      onClick={() => setFilter("all")} />
            <Tab label="Непрочитан."  active={filter==="unread"}   onClick={() => setFilter("unread")} />
            <Tab label="Pending"      active={filter==="pending"}  onClick={() => setFilter("pending")} />
            <Tab label="Привязаны"    active={filter==="linked"}   onClick={() => setFilter("linked")} />
            <Tab label="Блок"         active={filter==="blocked"}  onClick={() => setFilter("blocked")} />
            <Tab label="Архив"        active={filter==="archived"} onClick={() => setFilter("archived")} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-sm text-gray-500">Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Пусто</div>
          ) : (
            filtered.map((t) => {
              const isActive = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-800/60 transition flex items-start gap-3 ${
                    isActive ? "bg-zinc-800/60" : "hover:bg-zinc-900/50"
                  }`}
                >
                  <Avatar t={t} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium truncate">{threadTitle(t)}</div>
                      <div className="text-xs text-gray-500 shrink-0">{fmtTime(t.last_message_at)}</div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                      <div className="text-xs text-gray-400 truncate">
                        {t.last_dir === "out" ? "Вы: " : ""}{previewText(t)}
                      </div>
                      {t.unread_count > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {t.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <StatusBadge s={t.status} />
                      {t.customer_name && (
                        <span className="ml-2 text-[10px] text-gray-500">→ {t.customer_name}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT: chat */}
      <main className="flex-1 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            Выберите собеседника слева
          </div>
        ) : (
          <>
            {/* header */}
            <div className="p-4 border-b border-zinc-800 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <Avatar t={active} big />
                <div className="min-w-0">
                  <div className="font-semibold">{threadTitle(active)}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <StatusBadge s={active.status} />
                    {active.telegram_username && <span>@{active.telegram_username}</span>}
                    <span className="font-mono">chat {active.telegram_chat_id}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => setEventsModal(true)}
                  className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  События
                </button>

                {inArchive ? (
                  <>
                    <button
                      onClick={() => patchAppUser("unarchive")}
                      className="px-3 py-1 text-xs rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition"
                    >
                      Восстановить
                    </button>
                    <button
                      onClick={hardDelete}
                      className="px-3 py-1 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 transition"
                    >
                      Удалить навсегда
                    </button>
                  </>
                ) : (
                  <>
                    {!active.customer_id && active.status !== "blocked" && (
                      <>
                        <button
                          onClick={() => setCreateModal(true)}
                          className="px-3 py-1 text-xs rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition"
                        >
                          + Создать клиента
                        </button>
                        <button
                          onClick={() => setLinkModal(true)}
                          className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                        >
                          Привязать существ.
                        </button>
                      </>
                    )}
                    {active.status === "linked" && (
                      <button
                        onClick={() => { if (confirm("Отвязать?")) patchAppUser("unlink"); }}
                        className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                      >
                        Отвязать
                      </button>
                    )}
                    {active.status !== "blocked" ? (
                      <button
                        onClick={() => { if (confirm("Заблокировать?")) patchAppUser("block"); }}
                        className="px-3 py-1 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 transition"
                      >
                        Блок
                      </button>
                    ) : (
                      <button
                        onClick={() => patchAppUser("unblock")}
                        className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                      >
                        Разблок
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm("Архивировать?")) patchAppUser("archive"); }}
                      className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                    >
                      В архив
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMessages && messages.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">Загрузка...</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">Сообщений нет</div>
              ) : (
                messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))
              )}
              <div ref={chatBottom} />
            </div>

            {/* reply */}
            <div className="p-3 border-t border-zinc-800">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    inArchive                  ? "Архивный тред — сначала «Восстановить»"
                  : active.status === "blocked" ? "Заблокирован — отправка недоступна"
                  : "Ваш ответ... (Enter — отправить, Shift+Enter — перенос)"
                  }
                  disabled={sending || active.status === "blocked" || inArchive}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 transition disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={sending || !reply.trim() || active.status === "blocked" || inArchive}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition text-white"
                >
                  {sending ? "..." : "Отправить"}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* modals */}
      {active && linkModal && (
        <LinkCustomerModal
          appUser={{
            id: active.id,
            telegram_username: active.telegram_username,
            first_name: active.first_name,
            last_name: active.last_name,
            telegram_chat_id: active.telegram_chat_id,
          }}
          onClose={() => setLinkModal(false)}
          onLinked={() => { setLinkModal(false); fetchThreads(); }}
        />
      )}
      {active && createModal && (
        <CreateCustomerModal
          appUser={active}
          onClose={() => setCreateModal(false)}
          onCreated={() => { setCreateModal(false); fetchThreads(); }}
        />
      )}
      {active && eventsModal && (
        <AppUserEventsModal
          appUserId={active.id}
          title={threadTitle(active)}
          onClose={() => setEventsModal(false)}
        />
      )}
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md text-xs border transition ${
        active ? "border-zinc-300 bg-zinc-800/60" : "border-zinc-800 hover:bg-zinc-800/40"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cls: Record<string, string> = {
    pending: "border-zinc-600 text-zinc-300",
    linked:  "border-emerald-500/40 text-emerald-300",
    blocked: "border-red-500/40 text-red-300",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border ${cls[s] ?? "border-zinc-600"}`}>
      {s}
    </span>
  );
}

function Avatar({ t, big }: { t: Thread; big?: boolean }) {
  const initial = (t.first_name?.[0] ?? t.telegram_username?.[0] ?? "?").toUpperCase();
  const size = big ? "w-10 h-10 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`shrink-0 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center font-semibold ${size}`}>
      {initial}
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const out = m.direction === "out";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
          out
            ? "bg-emerald-700/40 border border-emerald-600/40 rounded-br-sm"
            : "bg-zinc-800/80 border border-zinc-700 rounded-bl-sm"
        }`}
      >
        {m.file_type && (
          <div className="text-xs text-gray-400 mb-1">[{m.file_type}]</div>
        )}
        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
        <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2 justify-end">
          {out && m.sent_by_name && <span>{m.sent_by_name}</span>}
          <span>{fmtFullTime(m.created_at)}</span>
          {out && m.status === "failed" && <span className="text-red-400">✗</span>}
          {out && m.status === "pending" && <span className="text-gray-500">⌛</span>}
        </div>
      </div>
    </div>
  );
}
