/* eslint-disable react-hooks/set-state-in-effect */
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

type Filter = "all" | "draft" | "finalized";

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "draft"     ? "Черновик"
  : status === "finalized" ? "finalized"
  : status;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border-2 border-zinc-500 text-zinc-800">
      {label}
    </span>
  );
}

function fmtNumber(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNumberShort(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toUTCString();
}

export default function WeightTicketsTable() {
  const [tickets, setTickets]       = useState<WeightTicket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<Filter>("all");
  const [openId, setOpenId]         = useState<number | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/weight-tickets");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Ошибка");
    else         setTickets(data as WeightTicket[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const stats = useMemo(() => {
    const total      = tickets.length;
    const drafts     = tickets.filter((t) => t.status === "draft").length;
    const finalized  = tickets.filter((t) => t.status === "finalized").length;
    const totalKg    = tickets.reduce((s, t) => s + (t.net_kg ?? 0), 0);
    return { total, drafts, finalized, totalKg };
  }, [tickets]);

  const filtered = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  return (
    <div className="p-8">
      {/* Header + filter buttons */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Акты взвешивания</h1>
          <p className="text-sm text-gray-500 mt-1">Журнал актов с деталями и печатью</p>
        </div>
        <div className="flex gap-2">
          <FilterButton active={filter === "all"}       onClick={() => setFilter("all")}       label="Все"             count={stats.total} />
          <FilterButton active={filter === "draft"}     onClick={() => setFilter("draft")}     label="Черновик"        count={stats.drafts} />
          <FilterButton active={filter === "finalized"} onClick={() => setFilter("finalized")} label="Финализировано"  count={stats.finalized} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex flex-1 gap-4 mb-6">
        <StatCard label="Всего"          value={String(stats.total)} />
        <StatCard label="Черновики"      value={String(stats.drafts)} />
        <StatCard label="Финализированы" value={String(stats.finalized)} />
        <StatCard label="Всего кг"       value={fmtNumberShort(stats.totalKg)} />
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
              <TableHead className="text-center">НЕТТО КГ</TableHead>
              <TableHead className="text-center">ДЕЙСТВИЯ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">Нет актов</TableCell></TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono">{t.ticket_number}</TableCell>
                  <TableCell>{fmtDate(t.ticket_date)}</TableCell>
                  <TableCell>{t.customer_name ?? "—"}</TableCell>
                  <TableCell>{t.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="font-mono">{t.sales_doc_number ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-center font-mono">{fmtNumber(t.net_kg)}</TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => setOpenId(t.id)}
                      className="px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-300 transition"
                    >
                      Открыть
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {openId !== null && (
        <WeightTicketDetailModal id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition ${
        active
          ? "border-zinc-400 bg-zinc-800/40"
          : "border-zinc-800 hover:bg-zinc-800/10"
      }`}
    >
      <span>{label}</span>
      <span className={`text-xs ${active
          ? "text-gray-800"
          : "text-gray-500"
        }`}>{count}</span>
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
