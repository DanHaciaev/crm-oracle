"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Copy, Hash, MessageSquareDot, Plus, Send, Settings, Trash2, Users, X, UserMinus, UserPlus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface StaffUser {
  id:         number;
  username:   string;
  first_name: string | null;
  last_name:  string | null;
  role:       string;
}

interface Message {
  id:                number;
  sender_id:         number;
  sender_username:   string;
  sender_first_name: string | null;
  sender_last_name:  string | null;
  body:              string;
  created_at:        string;
}

interface ChannelInfo {
  room:  string;
  label: string;
}

interface Unreads {
  myChannels:     ChannelInfo[];
  channelUnreads: Record<string, number>;
  dmUnreads:      Record<string, number>;
}

interface MembersModal {
  open:    boolean;
  channel: string;
  label:   string;
  members: StaffUser[];
  loading: boolean;
}

interface CreateModal {
  open:    boolean;
  label:   string;
  loading: boolean;
  error:   string;
}

interface CtxMenu {
  visible:   boolean;
  x:         number;
  y:         number;
  messageId: number;
  body:      string;
  canDelete: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

function dmRoom(a: number, b: number): string {
  return `dm:${Math.min(a, b)}:${Math.max(a, b)}`;
}

const AVATAR_COLORS = [
  "#516895", "#2A7BE4", "#1F2A44", "#3B7DD8",
  "#5A9E6F", "#C17B25", "#9B4D8C", "#C75E5E",
];

function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function userInitials(u: StaffUser): string {
  const f = u.first_name, l = u.last_name;
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f)      return f.slice(0, 2).toUpperCase();
  return u.username.slice(0, 2).toUpperCase();
}

function senderInitials(m: Message): string {
  const f = m.sender_first_name, l = m.sender_last_name;
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f)      return f.slice(0, 2).toUpperCase();
  return (m.sender_username ?? "?").slice(0, 2).toUpperCase();
}

function displayName(u: StaffUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return full || u.username;
}

function senderName(m: Message): string {
  const full = [m.sender_first_name, m.sender_last_name].filter(Boolean).join(" ");
  return full || m.sender_username || "?";
}

function fmtFull(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Sub-components ────────────────────────────────────────────

function Avatar({
  label, size = "md", style,
}: {
  label: string;
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}) {
  const sizeClass = size === "sm" ? "w-6 h-6 text-[9px]"
                  : size === "lg" ? "w-10 h-10 text-sm"
                  : "w-8 h-8 text-xs";
  return (
    <div
      className={`shrink-0 rounded-full text-white flex items-center justify-center font-bold ${sizeClass}`}
      style={style}
    >
      {label}
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: "#516895" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function StaffChat() {
  const { user } = useAuth();

  const [users,       setUsers]       = useState<StaffUser[]>([]);
  const [room,        setRoom]        = useState<string>("general");
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [unreads,     setUnreads]     = useState<Unreads>({ myChannels: [], channelUnreads: {}, dmUnreads: {} });
  const [input,       setInput]       = useState("");
  const [sending,     setSending]     = useState(false);
  const [loadingMsg,  setLoadingMsg]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Members modal state (admin only)
  const [modal,      setModal]      = useState<MembersModal>({
    open: false, channel: "", label: "", members: [], loading: false,
  });
  const [addUserId,  setAddUserId]  = useState<string>("");
  const [addLoading, setAddLoading] = useState(false);

  // Create channel modal (admin only)
  const [createModal, setCreateModal] = useState<CreateModal>({
    open: false, label: "", loading: false, error: "",
  });

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>({
    visible: false, x: 0, y: 0, messageId: 0, body: "", canDelete: false,
  });
  const ctxRef = useRef<HTMLDivElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // ── Fetch staff users ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/staff-chat/users")
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(d as StaffUser[]))
      .catch(() => {});
  }, []);

  // ── Fetch unread counts + my channel list (poll every 5s) ────
  const fetchUnreads = useCallback(() => {
    fetch("/api/staff-chat/rooms")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUnreads(d as Unreads))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchUnreads(); }, [fetchUnreads]);
  useEffect(() => {
    const id = setInterval(fetchUnreads, 5000);
    return () => clearInterval(id);
  }, [fetchUnreads]);

  // If current room is no longer accessible, switch to first available channel
  useEffect(() => {
    if (!room.startsWith("dm:") && unreads.myChannels.length > 0 && !unreads.myChannels.some(c => c.room === room)) {
      setRoom(unreads.myChannels[0].room);
    }
  }, [unreads.myChannels, room]);

  // ── Fetch messages for active room (poll every 3s) ───────────
  const fetchMessages = useCallback(async (r: string) => {
    const res = await fetch(`/api/staff-chat/messages?room=${encodeURIComponent(r)}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data as Message[]);
    setLoadingMsg(false);
  }, []);

  useEffect(() => {
    setLoadingMsg(true);
    setMessages([]);
    fetchMessages(room);
    fetchUnreads();
  }, [room, fetchMessages, fetchUnreads]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchMessages(room);
      fetchUnreads();
    }, 3000);
    return () => clearInterval(id);
  }, [room, fetchMessages, fetchUnreads]);

  // ── Scroll to bottom on new messages ─────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Send message ──────────────────────────────────────────────
  async function send() {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    await fetch("/api/staff-chat/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ room, body: input.trim() }),
    }).catch(() => {});
    setSending(false);
    setInput("");
    fetchMessages(room);
    fetchUnreads();
    inputRef.current?.focus();
  }

  // ── Members modal (admin) ─────────────────────────────────────
  async function openMembersModal(channel: string, label: string) {
    setModal({ open: true, channel, label, members: [], loading: true });
    setAddUserId("");
    const res = await fetch(`/api/staff-chat/channels/${channel}/members`);
    const members = res.ok ? await res.json() as StaffUser[] : [];
    setModal(prev => ({ ...prev, members, loading: false }));
  }

  async function addMember() {
    if (!addUserId || !modal.channel) return;
    setAddLoading(true);
    await fetch(`/api/staff-chat/channels/${modal.channel}/members`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: Number(addUserId) }),
    });
    setAddLoading(false);
    setAddUserId("");
    const res = await fetch(`/api/staff-chat/channels/${modal.channel}/members`);
    const members = res.ok ? await res.json() as StaffUser[] : modal.members;
    setModal(prev => ({ ...prev, members }));
    fetchUnreads();
  }

  async function removeMember(userId: number) {
    if (!modal.channel) return;
    await fetch(`/api/staff-chat/channels/${modal.channel}/members`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId }),
    });
    setModal(prev => ({ ...prev, members: prev.members.filter(m => m.id !== userId) }));
    fetchUnreads();
  }

  // ── Context menu helpers ──────────────────────────────────────
  useEffect(() => {
    function close(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(p => ({ ...p, visible: false }));
      }
    }
    function closeKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtxMenu(p => ({ ...p, visible: false }));
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", closeKey); };
  }, []);

  function openCtxMenu(e: React.MouseEvent, m: Message) {
    e.preventDefault();
    const canDelete = m.sender_id === user!.id || user!.role === "admin";
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, messageId: m.id, body: m.body, canDelete });
  }

  async function deleteMessage() {
    setCtxMenu(p => ({ ...p, visible: false }));
    await fetch("/api/staff-chat/messages", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messageId: ctxMenu.messageId }),
    });
    fetchMessages(room);
  }

  function copyText() {
    navigator.clipboard.writeText(ctxMenu.body).catch(() => {});
    setCtxMenu(p => ({ ...p, visible: false }));
  }

  // ── Create channel (admin) ────────────────────────────────────
  async function createChannel() {
    if (!createModal.label.trim() || createModal.loading) return;
    setCreateModal(prev => ({ ...prev, loading: true, error: "" }));
    const res = await fetch("/api/staff-chat/channels", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ label: createModal.label.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setCreateModal(prev => ({ ...prev, loading: false, error: (err as { error?: string }).error ?? "Ошибка" }));
      return;
    }
    const { room: newRoom } = await res.json() as { room: string };
    setCreateModal({ open: false, label: "", loading: false, error: "" });
    fetchUnreads();
    setRoom(newRoom);
  }

  function selectRoom(r: string) {
    setRoom(r);
    setSidebarOpen(false);
  }

  if (!user) return null;

  // ── Derived state ─────────────────────────────────────────────
  const isChannel   = !room.startsWith("dm:");
  const channelMeta = unreads.myChannels.find(c => c.room === room);
  const isAdmin     = user.role === "admin";
  const otherUsers  = users.filter(u => u.id !== user.id);

  function dmHeader(): { label: string; initials: string; color: string } | null {
    if (isChannel) return null;
    const parts   = room.replace("dm:", "").split(":");
    const otherId = Number(parts[0]) === user.id ? Number(parts[1]) : Number(parts[0]);
    const u       = users.find(u => u.id === otherId);
    if (!u) return { label: `Пользователь ${otherId}`, initials: "??", color: "#6A7080" };
    return { label: displayName(u), initials: userInitials(u), color: avatarColor(u.username) };
  }

  const dm = dmHeader();

  const totalUnread = Object.values(unreads.channelUnreads).reduce((s, n) => s + n, 0)
                    + Object.values(unreads.dmUnreads).reduce((s, n) => s + n, 0);

  const nonMembers = users.filter(u => !modal.members.some(m => m.id === u.id));

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-gray-50">

      {/* ══════════════ CONTEXT MENU ════════════════════════════ */}
      {ctxMenu.visible && (
        <div
          ref={ctxRef}
          className="fixed z-60 rounded-xl shadow-xl overflow-hidden"
          style={{
            top:  ctxMenu.y,
            left: ctxMenu.x,
            backgroundColor: "#fff",
            border: "1px solid rgba(81,104,149,0.15)",
            minWidth: 180,
          }}
        >
          <button
            onClick={copyText}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left"
          >
            <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            Копировать текст
          </button>
          {ctxMenu.canDelete && (
            <>
              <div className="border-t border-gray-100" />
              <button
                onClick={deleteMessage}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition text-left"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Удалить для всех
              </button>
            </>
          )}
        </div>
      )}

      {/* ══════════════ CREATE CHANNEL MODAL (admin) ════════════ */}
      {createModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateModal(p => ({ ...p, open: false }))} />
          <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden bg-white">
            <div
              className="px-5 py-4 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg, #1F2A44 0%, #2d3f62 100%)" }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Hash className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 text-sm font-semibold text-white">Новый канал</div>
              <button
                onClick={() => setCreateModal(p => ({ ...p, open: false }))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Название канала</label>
                <input
                  type="text"
                  value={createModal.label}
                  onChange={e => setCreateModal(p => ({ ...p, label: e.target.value, error: "" }))}
                  onKeyDown={e => e.key === "Enter" && createChannel()}
                  placeholder="Например: Маркетинг"
                  autoFocus
                  className="w-full rounded-xl border px-3 py-2 text-sm text-gray-900 outline-none"
                  style={{ borderColor: "rgba(81,104,149,0.3)", backgroundColor: "#f7f9fc" }}
                  onFocus={e => { e.target.style.borderColor = "#516895"; }}
                  onBlur={e  => { e.target.style.borderColor = "rgba(81,104,149,0.3)"; }}
                />
                {createModal.error && (
                  <p className="text-xs text-red-500 mt-1.5">{createModal.error}</p>
                )}
              </div>
              <button
                onClick={createChannel}
                disabled={!createModal.label.trim() || createModal.loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #1F2A44 0%, #516895 100%)" }}
              >
                {createModal.loading ? "Создание..." : "Создать канал"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MEMBERS MODAL (admin) ════════════════════ */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(p => ({ ...p, open: false }))} />
          <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: "#fff" }}>

            <div
              className="px-5 py-4 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg, #1F2A44 0%, #2d3f62 100%)" }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Hash className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">Участники канала</div>
                <div className="text-xs text-white/50">#{modal.label}</div>
              </div>
              <button
                onClick={() => setModal(p => ({ ...p, open: false }))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              {modal.loading ? (
                <div className="text-sm text-gray-400 text-center py-6">Загрузка...</div>
              ) : modal.members.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Нет участников</div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
                  {modal.members.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-xl"
                      style={{ backgroundColor: "#f7f9fc" }}
                    >
                      <Avatar
                        label={userInitials(m)}
                        size="sm"
                        style={{ backgroundColor: avatarColor(m.username) }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{displayName(m)}</div>
                        <div className="text-[10px] text-gray-400">{m.role === "admin" ? "Администратор" : "Менеджер"}</div>
                      </div>
                      {m.id !== user.id && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                          title="Убрать из канала"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!modal.loading && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Добавить участника</div>
                  {nonMembers.length === 0 ? (
                    <div className="text-xs text-gray-400">Все сотрудники уже в канале</div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={addUserId}
                        onChange={e => setAddUserId(e.target.value)}
                        className="flex-1 text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-brand bg-white text-gray-900"
                      >
                        <option value="">Выберите сотрудника...</option>
                        {nonMembers.map(u => (
                          <option key={u.id} value={u.id}>{displayName(u)}</option>
                        ))}
                      </select>
                      <button
                        onClick={addMember}
                        disabled={!addUserId || addLoading}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white transition disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg, #1F2A44 0%, #516895 100%)" }}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {addLoading ? "..." : "Добавить"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ LEFT SIDEBAR ══════════════════════════ */}
      <aside
        className={`
          ${sidebarOpen ? "flex" : "hidden"} md:flex
          w-64 shrink-0 flex-col border-r border-gray-200
          absolute md:relative z-20 h-full md:h-auto
        `}
        style={{ backgroundColor: "#f4f6fb" }}
      >
        {/* Sidebar header */}
        <div
          className="px-4 py-4 border-b border-white/20 flex items-center gap-2.5 shrink-0"
          style={{ background: "linear-gradient(135deg, #1F2A44 0%, #2d3f62 100%)" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <MessageSquareDot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white leading-tight">Внутренний чат</div>
            <div className="text-[10px] text-white/50 mt-0.5">Только для сотрудников</div>
          </div>
          {totalUnread > 0 && (
            <span className="shrink-0 text-[10px] font-bold text-white bg-white/20 rounded-full px-1.5 py-0.5">
              {totalUnread}
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1">

          {/* ── Channels ──────────────────────────────────────── */}
          <div className="px-3 mb-1">
            <div className="flex items-center px-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex-1">
                Каналы
              </span>
              {isAdmin && (
                <button
                  onClick={() => setCreateModal({ open: true, label: "", loading: false, error: "" })}
                  title="Создать канал"
                  className="w-5 h-5 rounded-md flex items-center justify-center text-gray-400 hover:text-brand hover:bg-brand/10 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {unreads.myChannels.length === 0 ? (
              <div className="text-xs text-gray-400 px-2.5 py-2">Нет доступных каналов</div>
            ) : (
              unreads.myChannels.map(ch => {
                const unread = unreads.channelUnreads[ch.room] ?? 0;
                const active = room === ch.room;
                return (
                  <div key={ch.room} className="group relative">
                    <button
                      onClick={() => selectRoom(ch.room)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${
                        active ? "font-semibold" : "text-gray-600"
                      }`}
                      style={active
                        ? { backgroundColor: "#516895", color: "#fff" }
                        : { backgroundColor: "transparent" }
                      }
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(81,104,149,0.1)"; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <Hash className={`w-3.5 h-3.5 shrink-0 ${active ? "text-white/80" : "text-gray-400"}`} />
                      <span className="flex-1 text-left truncate">{ch.label}</span>
                      <UnreadBadge count={active ? 0 : unread} />
                    </button>

                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); openMembersModal(ch.room, ch.label); }}
                        title="Управление участниками"
                        className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg flex items-center justify-center transition ${
                          active
                            ? "text-white/60 hover:text-white hover:bg-white/15 opacity-0 group-hover:opacity-100"
                            : "text-gray-400 hover:text-brand hover:bg-brand/10 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-gray-200/80" />

          {/* ── Staff / DMs ───────────────────────────────────── */}
          <div className="px-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-2 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Сотрудники
            </div>
            {otherUsers.length === 0 ? (
              <div className="text-xs text-gray-400 px-2.5 py-2">Нет других сотрудников</div>
            ) : (
              otherUsers.map(u => {
                const dr     = dmRoom(user.id, u.id);
                const unread = unreads.dmUnreads[dr] ?? 0;
                const active = room === dr;
                return (
                  <button
                    key={u.id}
                    onClick={() => selectRoom(dr)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all ${
                      active ? "font-semibold" : "text-gray-600"
                    }`}
                    style={active ? { backgroundColor: "#516895", color: "#fff" } : {}}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(81,104,149,0.1)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        label={userInitials(u)}
                        size="sm"
                        style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : avatarColor(u.username) }}
                      />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-[#f4f6fb]"
                        style={{ backgroundColor: "#4ade80" }}
                      />
                    </div>
                    <span className="flex-1 text-left truncate">{displayName(u)}</span>
                    <UnreadBadge count={active ? 0 : unread} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Current user footer */}
        <div className="border-t border-gray-200 p-3 shrink-0" style={{ backgroundColor: "#eef1f9" }}>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <Avatar
                label={user.username.slice(0, 2).toUpperCase()}
                size="sm"
                style={{ backgroundColor: avatarColor(user.username) }}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#eef1f9]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-900 truncate">{user.username}</div>
              <div className="text-[10px] text-gray-400">{isAdmin ? "Администратор" : "Менеджер"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-10 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ══════════════ CENTER — CHAT ════════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <button
            className="md:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
            onClick={() => setSidebarOpen(v => !v)}
          >
            <MessageSquareDot className="w-4 h-4" />
          </button>

          {isChannel ? (
            <>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #1F2A44, #516895)" }}
              >
                <Hash className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 leading-tight">
                  # {channelMeta?.label ?? room}
                </div>
                <div className="text-xs text-gray-400">Канал</div>
              </div>
              {isAdmin && channelMeta && (
                <button
                  onClick={() => openMembersModal(channelMeta.room, channelMeta.label)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-brand transition"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Участники
                </button>
              )}
            </>
          ) : dm ? (
            <>
              <Avatar label={dm.initials} size="md" style={{ backgroundColor: dm.color }} />
              <div>
                <div className="font-semibold text-gray-900 leading-tight">{dm.label}</div>
                <div className="text-xs text-gray-400">Личное сообщение</div>
              </div>
            </>
          ) : null}
        </div>

        {/* ── Messages area ─────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{
            backgroundColor: "#edf1f8",
            backgroundImage: [
              "linear-gradient(rgba(81,104,149,0.07) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(81,104,149,0.07) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "24px 24px",
          }}
        >
          {loadingMsg && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-gray-400">Загрузка...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.85)" }}
              >
                <MessageSquareDot className="w-8 h-8" style={{ color: "rgba(81,104,149,0.4)" }} />
              </div>
              <div className="text-sm text-gray-400 text-center">
                {isChannel
                  ? `Канал #${channelMeta?.label ?? room} пока пустой. Напишите первым!`
                  : `Начните диалог с ${dm?.label ?? "коллегой"}.`
                }
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((m, i) => {
                const isMe        = m.sender_id === user.id;
                const prev        = i > 0 ? messages[i - 1] : null;
                const next        = i < messages.length - 1 ? messages[i + 1] : null;
                const grouped     = prev?.sender_id === m.sender_id;
                const lastInGroup = !next || next.sender_id !== m.sender_id;
                const showDate    = !prev
                  || new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString();

                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-white/60" />
                        <span
                          className="text-[10px] font-medium text-gray-500 px-3 py-1 rounded-full"
                          style={{ backgroundColor: "rgba(255,255,255,0.8)" }}
                        >
                          {new Date(m.created_at).toLocaleDateString("ru-RU", {
                            weekday: "long", day: "numeric", month: "long",
                          })}
                        </span>
                        <div className="flex-1 h-px bg-white/60" />
                      </div>
                    )}

                    <div className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-3"}`}>
                      {!isMe && (
                        <div className="shrink-0 mb-0.5" style={{ width: 32 }}>
                          {!grouped && (
                            <Avatar
                              label={senderInitials(m)}
                              size="md"
                              style={{ backgroundColor: avatarColor(m.sender_username) }}
                            />
                          )}
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                        {!isMe && !grouped && isChannel && (
                          <span className="text-[11px] font-semibold text-gray-500 mb-1 px-1">
                            {senderName(m)}
                          </span>
                        )}

                        <div
                          onContextMenu={e => openCtxMenu(e, m)}
                          className={`px-4 py-2.5 text-sm leading-relaxed shadow-sm rounded-2xl cursor-default ${
                            isMe
                              ? lastInGroup ? "rounded-br-sm" : ""
                              : lastInGroup ? "rounded-bl-sm" : ""
                          }`}
                          style={isMe ? {
                            background: "linear-gradient(135deg, #1F2A44 0%, #516895 100%)",
                            color: "#fff",
                          } : {
                            backgroundColor: "#fff",
                            color: "#1F2A44",
                            border: "1px solid rgba(81,104,149,0.12)",
                          }}
                        >
                          <div className="whitespace-pre-wrap wrap-break-word">{m.body}</div>
                          <div className={`text-[10px] mt-1.5 select-none text-right ${isMe ? "text-white/50" : "text-gray-300"}`}>
                            {fmtFull(m.created_at)}
                          </div>
                        </div>
                      </div>

                      {isMe && (
                        <div className="shrink-0 mb-0.5" style={{ width: 32 }}>
                          {!grouped && (
                            <Avatar
                              label={user.username.slice(0, 2).toUpperCase()}
                              size="md"
                              style={{ backgroundColor: avatarColor(user.username) }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input area ────────────────────────────────────── */}
        <div
          className="px-4 py-3 border-t border-gray-200 shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={
                isChannel
                  ? `Написать в #${channelMeta?.label?.toLowerCase() ?? room}…`
                  : `Написать ${dm?.label ?? "коллеге"}…`
              }
              disabled={sending}
              rows={1}
              className="flex-1 resize-none rounded-2xl border px-4 py-3 text-sm text-gray-900 outline-none transition disabled:opacity-50"
              style={{
                borderColor: "rgba(81,104,149,0.25)",
                backgroundColor: "#f4f6fb",
                maxHeight: 120,
                lineHeight: "1.5",
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#516895"; }}
              onBlur={e  => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(81,104,149,0.25)"; }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{
                background: input.trim() && !sending
                  ? "linear-gradient(135deg, #1F2A44 0%, #516895 100%)"
                  : "#e2e6f0",
              }}
              title="Отправить (Enter)"
            >
              <Send className={`w-4 h-4 ${input.trim() && !sending ? "text-white" : "text-gray-400"}`} />
            </button>
          </div>
          <div className="text-[10px] text-gray-400 mt-1.5 text-center select-none">
            Enter — отправить · Shift+Enter — новая строка
          </div>
        </div>
      </main>
    </div>
  );
}
