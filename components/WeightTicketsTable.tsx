"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import WeightTicketDetailModal from "@/components/WeightTicketDetailModal";
import type { PdfLang } from "@/lib/pdf-act";
import { useT, useLocale } from "@/lib/locale";

export interface WeightTicket {
  id: number;
  ticket_number: string;
  ticket_date: string | null;
  status: string;
  operator: string | null;
  customer_name: string | null;
  warehouse_name: string | null;
  sales_doc_number: string | null;
  net_kg: number;
}

type StatusFilter = "all" | "draft" | "finalized";

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const cfg: Record<string, { label: string; cls: string }> = {
    draft: { label: t("weightTickets.statusDraft"), cls: "border-amber-500/40 text-amber-400 bg-amber-500/10" },
    finalized: { label: t("weightTickets.statusFinalized"), cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "border-gray-800 text-gray-500 bg-gray-100" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export default function WeightTicketsTable() {
  const t = useT();
  const { locale } = useLocale();
  const [tickets, setTickets] = useState<WeightTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [langPickId, setLangPickId] = useState<number | null>(null);

  const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";

  function fmtKg(n: number) {
    return n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtKgShort(n: number) {
    return n.toLocaleString(loc, { maximumFractionDigits: 2 });
  }
  function fmtDate(s: string | null): string {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function exportCsv(items: WeightTicket[]) {
    const headers = [
      t("weightTickets.cols.num"),
      t("weightTickets.cols.date"),
      t("weightTickets.cols.customer"),
      t("weightTickets.cols.vehicle"),
      t("weightTickets.salesDoc"),
      t("weightTickets.cols.status"),
      t("weightTickets.cols.net"),
    ];
    const rows = items.map((ticket) => [
      ticket.ticket_number,
      fmtDate(ticket.ticket_date),
      ticket.customer_name ?? "",
      ticket.warehouse_name ?? "",
      ticket.sales_doc_number ?? "",
      ticket.status,
      ticket.net_kg.toFixed(2).replace(".", ","),
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

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const url = `/api/weight-tickets${params.size ? "?" + params : ""}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setTickets(data as WeightTicket[]);
    setLoading(false);
  }, [dateFrom, dateTo, t]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const stats = useMemo(() => ({
    total: tickets.length,
    drafts: tickets.filter((ticket) => ticket.status === "draft").length,
    finalized: tickets.filter((ticket) => ticket.status === "finalized").length,
    totalKg: tickets.reduce((s, ticket) => s + (ticket.net_kg ?? 0), 0),
  }), [tickets]);

  const filtered = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchStatus = statusFilter === "all" || ticket.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        ticket.ticket_number.toLowerCase().includes(q) ||
        (ticket.customer_name ?? "").toLowerCase().includes(q) ||
        (ticket.warehouse_name ?? "").toLowerCase().includes(q) ||
        (ticket.sales_doc_number ?? "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [tickets, statusFilter, search]);

  async function sendToTelegram(ticketId: number, lang: PdfLang) {
    setLangPickId(null);
    setSendingId(ticketId);
    try {
      const res = await fetch(`/api/weight-tickets/${ticketId}/send-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json().catch(() => ({}));
      alert(res.ok ? t("weightTickets.tgSentSuccess") : (json as { error?: string }).error ?? t("common.error"));
    } catch {
      alert(t("weightTickets.networkError"));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("weightTickets.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("weightTickets.journalSubtitle")}</p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-800 text-sm hover:bg-gray-100 transition shrink-0 text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t("weightTickets.exportCsv")}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="flex flex-wrap gap-2">
          <FilterBtn active={statusFilter === "all"} onClick={() => setStatus("all")} label={t("common.all")} count={stats.total} />
          <FilterBtn active={statusFilter === "draft"} onClick={() => setStatus("draft")} label={t("weightTickets.filterDraft")} count={stats.drafts} />
          <FilterBtn active={statusFilter === "finalized"} onClick={() => setStatus("finalized")} label={t("weightTickets.filterFinalized")} count={stats.finalized} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-sm text-gray-400 hover:text-gray-700 transition"
            >✕</button>
          )}
        </div>

        <input
          type="text"
          placeholder={t("weightTickets.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition w-full sm:w-64"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("weightTickets.totalTickets")} value={String(stats.total)} />
        <StatCard label={t("weightTickets.totalDrafts")} value={String(stats.drafts)} />
        <StatCard label={t("weightTickets.totalFinalized")} value={String(stats.finalized)} />
        <StatCard label={t("weightTickets.totalNetKg")} value={fmtKgShort(stats.totalKg)} />
      </div>

      <div className="border border-gray-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("weightTickets.cols.num").toUpperCase()}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("weightTickets.cols.date").toUpperCase()}</TableHead>
              <TableHead>{t("weightTickets.cols.customer").toUpperCase()}</TableHead>
              <TableHead className="hidden md:table-cell">{t("weightTickets.warehouse").toUpperCase()}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("weightTickets.salesDoc").toUpperCase()}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("weightTickets.cols.status").toUpperCase()}</TableHead>
              <TableHead className="text-center">{t("weightTickets.cols.net").toUpperCase()}</TableHead>
              <TableHead className="text-center">{t("common.actions").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("weightTickets.noTickets")}</TableCell></TableRow>
            ) : (
              filtered.map((ticket) => (
                <TableRow key={ticket.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="font-mono text-sm">{ticket.ticket_number}</TableCell>
                  <TableCell className="hidden sm:table-cell tabular-nums">{fmtDate(ticket.ticket_date)}</TableCell>
                  <TableCell>{ticket.customer_name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{ticket.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-sm">{ticket.sales_doc_number ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={ticket.status} /></TableCell>
                  <TableCell className="text-center font-mono tabular-nums">{fmtKg(ticket.net_kg)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setOpenId(ticket.id)}
                        className="px-3 py-1 text-sm rounded-md border border-gray-800 hover:bg-gray-100 transition text-gray-700"
                      >
                        {t("weightTickets.open")}
                      </button>
                      {langPickId === ticket.id ? (
                        <>
                          {(["ru", "ro", "en"] as const).map((lng) => (
                            <button
                              key={lng}
                              onClick={() => sendToTelegram(ticket.id, lng)}
                              className="px-2 py-1 text-sm rounded-md border border-sky-300 text-sky-300 hover:bg-sky-00 transition"
                            >
                              {lng.toUpperCase()}
                            </button>
                          ))}
                          <button
                            onClick={() => setLangPickId(null)}
                            className="px-1.5 py-1 text-sm rounded-md border border-gray-800 text-gray-500 hover:bg-gray-100 transition"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setLangPickId(ticket.id)}
                          disabled={sendingId === ticket.id}
                          className="px-3 py-1 text-sm rounded-md border border-gray-800 text-sky-400 hover:bg-gray-200 transition disabled:opacity-40"
                          title={t("weightTickets.sendTg")}
                        >
                          {sendingId === ticket.id ? "..." : "TG"}
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

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-center text-sm text-gray-400">
          {t("weightTickets.showing")}: {filtered.length} — {t("weightTickets.netto")}: {fmtKgShort(filtered.reduce((s, ticket) => s + ticket.net_kg, 0))} кг
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
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition ${active ? "border-gray-800 bg-gray-900 text-white" : "border-gray-800 text-gray-500 hover:bg-gray-100"
        }`}
    >
      <span>{label}</span>
      <span className={`text-sm tabular-nums ${active ? "text-white" : "text-gray-400"}`}>{count}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
