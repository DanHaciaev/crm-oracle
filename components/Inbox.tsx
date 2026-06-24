/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import CreateCustomerModal from "@/components/CreateCustomerModal";
import AppUserEventsModal from "@/components/AppUserEventsModal";
import { useT, useLocale } from "@/lib/locale";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";

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
  const t       = useT();
  const confirm = useConfirm();
  const { locale } = useLocale();
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

  function fmtTime(s: string | null) {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
    return sameDay
      ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" });
  }

  function fmtFullTime(s: string | null) {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
    return d.toLocaleString(loc, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

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

  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      toast.error((j as { error?: string }).error ?? t("common.error"));
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
      toast.error((j as { error?: string }).error ?? t("common.error"));
      return;
    }
    if (action === "archive" || action === "unarchive") {
      setActiveId(null);
      setMessages([]);
    }
    fetchThreads();
  }

  async function hardDelete() {
    if (!active) return;
    if (!await confirm({ message: t("inbox.deletePermanentConfirm"), danger: true })) return;
    const res = await fetch(`/api/app-users/${active.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error((j as { error?: string }).error ?? t("common.error"));
      return;
    }
    setActiveId(null);
    setMessages([]);
    fetchThreads();
  }

  const filtered = useMemo(() => {
    if (filter === "archived") return threads;
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
      {/* ── LEFT: thread list ─────────────────────────────────────────── */}
      <aside
        className={`${
          activeId !== null ? "hidden inbox:flex" : "flex"
        } w-full inbox:w-80 inbox:border-r border-[#c8d3e8] flex-col bg-white`}
      >
        {/* Tabs header */}
        <div className="px-3 pt-3 pb-0 border-b border-[#c8d3e8]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base font-semibold text-gray-900">Inbox</span>
            {totalUnread > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                {totalUnread} {t("inbox.unreadCount")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap -mx-1">
            {[
              { v: "all",      label: t("inbox.tabs.all") },
              { v: "unread",   label: t("inbox.tabs.unread") },
              { v: "pending",  label: "Pending" },
              { v: "linked",   label: t("inbox.tabs.linked") },
              { v: "blocked",  label: t("inbox.tabs.blocked") },
              { v: "archived", label: t("inbox.tabs.archive") },
            ].map(tab => (
              <button
                key={tab.v}
                onClick={() => setFilter(tab.v as Filter)}
                className={`px-2.5 py-2 text-xs whitespace-nowrap border-b-2 transition -mb-px ${
                  filter === tab.v
                    ? "border-brand text-brand font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-sm text-gray-400">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">{t("inbox.empty")}</div>
          ) : (
            filtered.map((th) => {
              const isActive = th.id === activeId;
              return (
                <button
                  key={th.id}
                  onClick={() => setActiveId(th.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition flex items-start gap-3 ${
                    isActive ? "bg-brand/5 border-l-2 border-l-brand" : "hover:bg-gray-50"
                  }`}
                >
                  <Avatar th={th} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className={`truncate ${isActive ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                        {threadTitle(th)}
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">{fmtTime(th.last_message_at)}</div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                      <div className="text-xs text-gray-400 truncate">
                        {th.last_dir === "out" ? "↩ " : ""}{previewText(th)}
                      </div>
                      {th.unread_count > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-medium bg-brand/10 text-brand border border-brand/20">
                          {th.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusBadge s={th.status} />
                      {th.customer_name && (
                        <span className="text-[10px] text-gray-400 truncate">→ {th.customer_name}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── CENTER: chat ──────────────────────────────────────────────── */}
      <main
        className={`${
          activeId !== null ? "flex" : "hidden inbox:flex"
        } flex-1 flex-col min-w-0`}
        style={{ backgroundColor: "#e9eef6", backgroundImage: "radial-gradient(circle, #c4cede 1.5px, transparent 1.5px)", backgroundSize: "26px 26px" }}
      >
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-3xl">💬</div>
            <span className="text-sm">{t("inbox.selectContact")}</span>
          </div>
        ) : (
          <>
            {/* Simplified header */}
            <div className="px-3 sm:px-4 py-3 border-b border-[#c8d3e8] bg-white flex items-center gap-3">
              <button
                onClick={() => { setActiveId(null); setMessages([]); }}
                aria-label={t("common.back")}
                className="inbox:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd" />
                </svg>
              </button>
              <Avatar th={active} big />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{threadTitle(active)}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge s={active.status} />
                  {active.telegram_username && (
                    <span className="text-xs text-gray-400">@{active.telegram_username}</span>
                  )}
                </div>
              </div>
              {/* Mobile actions only */}
              <button
                onClick={() => setEventsModal(true)}
                className="lg:hidden shrink-0 px-2.5 py-1 text-xs rounded-md border border-[#c8d3e8] hover:bg-gray-100 transition text-gray-600"
              >
                {t("inbox.events")}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
              {loadingMessages && messages.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">{t("common.loading")}</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">{t("inbox.chatMessages")}</div>
              ) : (
                messages.map((m) => (
                  <MessageBubble key={m.id} m={m} fmtTime={fmtFullTime} />
                ))
              )}
              <div ref={chatBottom} />
            </div>

            {/* Reply input */}
            <div className="p-2 sm:p-3 border-t border-[#c8d3e8] bg-white/90 backdrop-blur-sm">
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
                    inArchive                   ? t("inbox.archivedNote")
                  : active.status === "blocked" ? t("inbox.blockedNote")
                  : t("inbox.replyPlaceholder")
                  }
                  disabled={sending || active.status === "blocked" || inArchive}
                  rows={2}
                  className="flex-1 min-w-0 resize-none rounded-2xl border border-[#c8d3e8] bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-brand transition disabled:opacity-50 shadow-sm"
                />
                <button
                  onClick={send}
                  disabled={sending || !reply.trim() || active.status === "blocked" || inArchive}
                  className="shrink-0 w-10 h-10 rounded-full bg-brand hover:bg-brand-dark flex items-center justify-center transition disabled:opacity-40 shadow-md"
                  aria-label={t("common.send")}
                >
                  {sending ? (
                    <span className="text-white text-xs">…</span>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-4 h-4 text-white translate-x-px">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── RIGHT: client info panel ──────────────────────────────────── */}
      {active && (
        <aside className="w-72 shrink-0 border-l border-[#c8d3e8] flex-col bg-white overflow-y-auto hidden lg:flex">
          {/* Contact card */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-col items-center text-center gap-2 mb-4">
              <Avatar th={active} big />
              <div>
                <div className="font-semibold text-gray-900">{threadTitle(active)}</div>
                {active.telegram_username && (
                  <div className="text-sm text-gray-400 mt-0.5">@{active.telegram_username}</div>
                )}
              </div>
              <StatusBadge s={active.status} />
            </div>

            {/* Meta info */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 shrink-0">TG</span>
                <span className="font-mono text-xs text-gray-500 truncate">chat {active.telegram_chat_id}</span>
              </div>
              {active.customer_id && active.customer_name && (
                <a
                  href={`/customers/${active.customer_id}`}
                  className="flex items-center gap-2 text-brand hover:underline"
                >
                  <span className="text-gray-400 shrink-0">→</span>
                  <span className="truncate">{active.customer_name}</span>
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 space-y-2">
            <button
              onClick={() => setEventsModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#c8d3e8] text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              📋 {t("inbox.events")}
            </button>

            {inArchive ? (
              <>
                <button
                  onClick={() => patchAppUser("unarchive")}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 text-sm text-emerald-700 hover:bg-emerald-50 transition"
                >
                  ↩ {t("inbox.restore")}
                </button>
                <button
                  onClick={hardDelete}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  🗑 {t("inbox.deletePermanent")}
                </button>
              </>
            ) : (
              <>
                {!active.customer_id && active.status !== "blocked" && (
                  <>
                    <button
                      onClick={() => setCreateModal(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-brand/30 text-sm text-brand hover:bg-brand/5 transition"
                    >
                      ✚ {t("inbox.createCustomer")}
                    </button>
                    <button
                      onClick={() => setLinkModal(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#c8d3e8] text-sm text-gray-700 hover:bg-gray-50 transition"
                    >
                      🔗 {t("inbox.linkExisting")}
                    </button>
                  </>
                )}
                {active.status === "linked" && (
                  <button
                    onClick={async () => { if (await confirm({ message: t("inbox.unlinkConfirm") })) patchAppUser("unlink"); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#c8d3e8] text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    ✂ {t("inbox.unlink")}
                  </button>
                )}
                <button
                  onClick={async () => { if (await confirm({ message: t("inbox.archiveConfirm") })) patchAppUser("archive"); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#c8d3e8] text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  📁 {t("inbox.archive")}
                </button>
                {active.status !== "blocked" ? (
                  <button
                    onClick={async () => { if (await confirm({ message: t("inbox.blockConfirm"), danger: true })) patchAppUser("block"); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    🚫 {t("inbox.block")}
                  </button>
                ) : (
                  <button
                    onClick={() => patchAppUser("unblock")}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#c8d3e8] text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    ✓ {t("inbox.unblock")}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      )}

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

function StatusBadge({ s }: { s: string }) {
  const cls: Record<string, string> = {
    pending: "border-[#c8d3e8] text-gray-500 bg-gray-50",
    linked:  "border-emerald-200 text-emerald-600 bg-emerald-50",
    blocked: "border-red-200 text-red-500 bg-red-50",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border ${cls[s] ?? "border-[#c8d3e8] text-gray-500"}`}>
      {s}
    </span>
  );
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-amber-500", "bg-cyan-600", "bg-indigo-500",
];

function avatarColor(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ th, big }: { th: Thread; big?: boolean }) {
  const initial = (th.first_name?.[0] ?? th.telegram_username?.[0] ?? "?").toUpperCase();
  const key     = th.first_name ?? th.telegram_username ?? "?";
  const size    = big ? "w-10 h-10 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`shrink-0 rounded-full ${avatarColor(key)} text-white flex items-center justify-center font-semibold ${size}`}>
      {initial}
    </div>
  );
}

function MessageBubble({ m, fmtTime }: { m: Message; fmtTime: (s: string | null) => string }) {
  const out = m.direction === "out";
  return (
    <div className={`flex items-end gap-2 ${out ? "justify-end" : "justify-start"}`}>
      {!out && (
        <div className="w-7 h-7 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5">
          ?
        </div>
      )}
      <div className={`max-w-[72%] flex flex-col ${out ? "items-end" : "items-start"}`}>
        {out && m.sent_by_name && (
          <span className="text-[10px] text-gray-400 mb-0.5 px-1">{m.sent_by_name}</span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            out
              ? "bg-brand text-white rounded-br-none shadow-md"
              : "bg-white text-gray-900 border border-gray-100 rounded-bl-none shadow-sm"
          }`}
        >
          {m.file_type && (
            <div className={`text-xs mb-1 ${out ? "text-white/70" : "text-gray-400"}`}>[{m.file_type}]</div>
          )}
          {m.body && <div className="whitespace-pre-wrap wrap-break-word">{m.body}</div>}
          <div className={`text-[10px] mt-1 flex items-center gap-1.5 ${out ? "justify-end text-white/60" : "justify-end text-gray-400"}`}>
            <span>{fmtTime(m.created_at)}</span>
            {out && m.status === "failed"  && <span className="text-red-300">✗</span>}
            {out && m.status === "pending" && <span className="opacity-70">⌛</span>}
            {out && m.status === "sent"    && <span className="opacity-70">✓</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
