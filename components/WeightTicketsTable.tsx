"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import WeightTicketDetailModal from "@/components/WeightTicketDetailModal";

export interface WeightTicket {
  id:               number;
  ticket_number:    string;
  ticket_date:      string | null;
  status:           string;
  operator:         string | null;
  customer_name:    string | null;
  warehouse_name:   string | null;
  sales_doc_number: string | null;
  net_kg:           number;
}

type StatusFilter = "all" | "draft" | "finalized";

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    draft:     { label: "Черновик",       cls: "border-amber-500/40 text-amber-400 bg-amber-500/10" },
    finalized: { label: "Финализирован",  cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "border-zinc-600 text-zinc-400 bg-zinc-800" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

function fmtKg(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKgShort(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function exportCsv(tickets: WeightTicket[]) {
  const headers = ["Номер", "Дата", "Клиент", "Склад", "Документ продажи", "Статус", "Нетто кг"];
  const rows = tickets.map((t) => [
    t.ticket_number,
    fmtDate(t.ticket_date),
    t.customer_name ?? "",
    t.warehouse_name ?? "",
    t.sales_doc_number ?? "",
    t.status,
    t.net_kg.toFixed(2).replace(".", ","),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weight-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WeightTicketsTable() {
  const [tickets, setTickets]     = useState<WeightTicket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [statusFilter, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [openId, setOpenId]       = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo)   params.set("to",   dateTo);
    const url = `/api/weight-tickets${params.size ? "?" + params : ""}`;
    const res  = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else         setTickets(data as WeightTicket[]);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const stats = useMemo(() => ({
    total:     tickets.length,
    drafts:    tickets.filter((t) => t.status === "draft").length,
    finalized: tickets.filter((t) => t.status === "finalized").length,
    totalKg:   tickets.reduce((s, t) => s + (t.net_kg ?? 0), 0),
  }), [tickets]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        t.ticket_number.toLowerCase().includes(q) ||
        (t.customer_name ?? "").toLowerCase().includes(q) ||
        (t.warehouse_name ?? "").toLowerCase().includes(q) ||
        (t.sales_doc_number ?? "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [tickets, statusFilter, search]);

  async function sendToTelegram(ticketId: number) {
    setSendingId(ticketId);
    try {
      const res = await fetch(`/api/weight-tickets/${ticketId}/send-telegram`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      alert(res.ok ? "✅ Акт отправлен клиенту в Telegram" : (json as { error?: string }).error ?? "Ошибка отправки");
    } catch {
      alert("❌ Ошибка сети");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-col acts:flex-row">
        <div>
          <h1 className="text-2xl font-bold">Акты взвешивания</h1>
          <p className="text-sm text-gray-500 mt-1">Журнал актов с деталями и печатью</p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-sm hover:bg-zinc-800/40 transition shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Экспорт CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        {/* Status buttons */}
        <div className="flex gap-2">
          <FilterBtn active={statusFilter === "all"}       onClick={() => setStatus("all")}       label="Все"            count={stats.total} />
          <FilterBtn active={statusFilter === "draft"}     onClick={() => setStatus("draft")}     label="Черновики"      count={stats.drafts} />
          <FilterBtn active={statusFilter === "finalized"} onClick={() => setStatus("finalized")} label="Финализованы"   count={stats.finalized} />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition"
            placeholder="От"
          />
          <span className="text-zinc-600 text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition"
            placeholder="До"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >✕</button>
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Поиск по клиенту, номеру..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition w-64"
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 acts:grid-cols-4 gap-4 mb-6">
        <StatCard label="Всего актов"    value={String(stats.total)} />
        <StatCard label="Черновики"      value={String(stats.drafts)} />
        <StatCard label="Финализованы"   value={String(stats.finalized)} />
        <StatCard label="Всего нетто кг" value={fmtKgShort(stats.totalKg)} />
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>НОМЕР</TableHead>
              <TableHead>ДАТА</TableHead>
              <TableHead>КЛИЕНТ</TableHead>
              <TableHead>СКЛАД</TableHead>
              <TableHead>ДОК. ПРОДАЖИ</TableHead>
              <TableHead>СТАТУС</TableHead>
              <TableHead className="text-right">НЕТТО КГ</TableHead>
              <TableHead className="text-center">ДЕЙСТВИЯ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">Актов не найдено</TableCell></TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-zinc-900/40 transition-colors">
                  <TableCell className="font-mono text-sm">{t.ticket_number}</TableCell>
                  <TableCell className="tabular-nums">{fmtDate(t.ticket_date)}</TableCell>
                  <TableCell>{t.customer_name ?? "—"}</TableCell>
                  <TableCell className="text-zinc-400">{t.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{t.sales_doc_number ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtKg(t.net_kg)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setOpenId(t.id)}
                        className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                      >
                        Открыть
                      </button>
                      <button
                        onClick={() => sendToTelegram(t.id)}
                        disabled={sendingId === t.id}
                        className="px-3 py-1 text-xs rounded-md border border-sky-700 text-sky-400 hover:bg-sky-950/50 transition disabled:opacity-40"
                        title="Отправить акт в Telegram клиенту"
                      >
                        {sendingId === t.id ? "..." : "TG"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer summary */}
      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-right text-xs text-zinc-500">
          Показано: {filtered.length} — Нетто: {fmtKgShort(filtered.reduce((s, t) => s + t.net_kg, 0))} кг
        </div>
      )}

      {openId !== null && (
        <WeightTicketDetailModal id={openId} onClose={() => setOpenId(null)} />
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
        active ? "border-zinc-400 bg-zinc-800/40 text-white" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800/20"
      }`}
    >
      <span>{label}</span>
      <span className={`text-xs tabular-nums ${active ? "text-zinc-300" : "text-zinc-600"}`}>{count}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
