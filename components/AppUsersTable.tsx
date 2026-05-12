"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import LinkCustomerModal from "@/components/LinkCustomerModal";
import AppUserEventsModal from "@/components/AppUserEventsModal";

interface AppUser {
  id:                number;
  telegram_chat_id:  number;
  telegram_username: string | null;
  first_name:        string | null;
  last_name:         string | null;
  language_code:     string | null;
  status:            "pending" | "linked" | "blocked";
  customer_id:       number | null;
  customer_name:     string | null;
  first_seen:        string | null;
  last_seen:         string | null;
}

type Filter = "all" | "pending" | "linked" | "blocked";

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending:  "border-zinc-600 text-zinc-300",
    linked:   "border-emerald-500/40 text-emerald-300",
    blocked:  "border-red-500/40 text-red-300",
  };
  const label: Record<string, string> = {
    pending: "pending",
    linked:  "linked",
    blocked: "blocked",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${map[s] ?? "border-zinc-600"}`}>
      {label[s] ?? s}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AppUsersTable() {
  const [users, setUsers]       = useState<AppUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<Filter>("all");
  const [linkTarget, setLinkTarget]   = useState<AppUser | null>(null);
  const [eventsTarget, setEventsTarget] = useState<AppUser | null>(null);
  const [busy, setBusy]         = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/app-users");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else         setUsers(data as AppUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const stats = useMemo(() => ({
    total:    users.length,
    pending:  users.filter((u) => u.status === "pending").length,
    linked:   users.filter((u) => u.status === "linked").length,
    blocked:  users.filter((u) => u.status === "blocked").length,
  }), [users]);

  const filtered = useMemo(() => (
    filter === "all" ? users : users.filter((u) => u.status === filter)
  ), [users, filter]);

  async function patch(id: number, body: object) {
    setBusy(true);
    const res = await fetch(`/api/app-users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    fetchUsers();
  }

  function fullName(u: AppUser) {
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Подписчики бота</h1>
          <p className="text-sm text-gray-500 mt-1">Все, кто запускал бота. Привяжите их к клиентам или заблокируйте.</p>
        </div>
        <div className="flex gap-2">
          <FilterBtn active={filter === "all"}     onClick={() => setFilter("all")}     label="Все"           count={stats.total} />
          <FilterBtn active={filter === "pending"} onClick={() => setFilter("pending")} label="Pending"       count={stats.pending} />
          <FilterBtn active={filter === "linked"}  onClick={() => setFilter("linked")}  label="Привязаны"     count={stats.linked} />
          <FilterBtn active={filter === "blocked"} onClick={() => setFilter("blocked")} label="Заблокированы" count={stats.blocked} />
        </div>
      </div>

      <div className="flex flex-1 gap-4 mb-6">
        <StatCard label="Всего"          value={String(stats.total)} />
        <StatCard label="Pending"        value={String(stats.pending)} />
        <StatCard label="Привязаны"      value={String(stats.linked)} />
        <StatCard label="Заблокированы"  value={String(stats.blocked)} />
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TG USERNAME</TableHead>
              <TableHead>ИМЯ</TableHead>
              <TableHead>CHAT ID</TableHead>
              <TableHead>СТАТУС</TableHead>
              <TableHead>КЛИЕНТ</TableHead>
              <TableHead>ПЕРВЫЙ КОНТАКТ</TableHead>
              <TableHead>ПОСЛЕДНИЙ</TableHead>
              <TableHead className="text-right">ДЕЙСТВИЯ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">Пусто</TableCell></TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono">{u.telegram_username ? `@${u.telegram_username}` : "—"}</TableCell>
                  <TableCell>{fullName(u)}</TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">{u.telegram_chat_id}</TableCell>
                  <TableCell><StatusBadge s={u.status} /></TableCell>
                  <TableCell>
                    {u.customer_name ? (
                      <span className="text-sm">{u.customer_name}</span>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">{fmtDate(u.first_seen)}</TableCell>
                  <TableCell className="text-xs text-gray-400">{fmtDate(u.last_seen)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => setEventsTarget(u)}
                        className="px-2 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                        title="Журнал событий"
                      >
                        События
                      </button>
                      {u.status !== "blocked" && !u.customer_id && (
                        <button
                          onClick={() => setLinkTarget(u)}
                          className="px-2 py-1 text-xs rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition"
                        >
                          Привязать
                        </button>
                      )}
                      {u.status === "linked" && (
                        <button
                          disabled={busy}
                          onClick={() => { if (confirm("Отвязать?")) patch(u.id, { action: "unlink" }); }}
                          className="px-2 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                        >
                          Отвязать
                        </button>
                      )}
                      {u.status !== "blocked" && (
                        <button
                          disabled={busy}
                          onClick={() => { if (confirm("Заблокировать?")) patch(u.id, { action: "block" }); }}
                          className="px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 transition"
                        >
                          Блок
                        </button>
                      )}
                      {u.status === "blocked" && (
                        <button
                          disabled={busy}
                          onClick={() => patch(u.id, { action: "unblock" })}
                          className="px-2 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                        >
                          Разблок
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {linkTarget && (
        <LinkCustomerModal
          appUser={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={() => { setLinkTarget(null); fetchUsers(); }}
        />
      )}
      {eventsTarget && (
        <AppUserEventsModal
          appUserId={eventsTarget.id}
          title={eventsTarget.telegram_username ? `@${eventsTarget.telegram_username}` : `chat ${eventsTarget.telegram_chat_id}`}
          onClose={() => setEventsTarget(null)}
        />
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition ${
        active ? "border-zinc-300 bg-zinc-800/50" : "border-zinc-800 hover:bg-zinc-800/30"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-gray-400">{count}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border flex-1 border-zinc-800 rounded-xl p-5 text-center">
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
