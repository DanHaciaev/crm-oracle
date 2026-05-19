/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

export interface SaleDoc {
  id:               number;
  doc_number:       string;
  doc_date:         string | null;
  customer_name:    string;
  customer_id:      number | null;
  sale_type:        string;
  status:           string;
  total_amount:     number;
  total_amount_mdl: number;
  currency_code:    string;
  total_net_kg:     number;
  invoice_number:   string;
}

const STATUS_CLS: Record<string, string> = {
  draft:     "border-zinc-600    text-zinc-400    bg-zinc-800/60",
  confirmed: "border-blue-500/40  text-blue-400   bg-blue-500/10",
  shipped:   "border-violet-500/40 text-violet-400 bg-violet-500/10",
  closed:    "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  cancelled: "border-red-500/40   text-red-400    bg-red-500/10",
};

const TYPE_CLS: Record<string, string> = {
  domestic: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  export:   "border-sky-500/40   text-sky-400   bg-sky-500/10",
};

function StatusBadge({ status }: { status: string }) {
  const t   = useT();
  const cls = STATUS_CLS[status] ?? "border-zinc-600 text-zinc-400";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {t(`sales.statuses.${status}`) || status}
  </span>;
}

function TypeBadge({ type }: { type: string }) {
  const t   = useT();
  const cls = TYPE_CLS[type] ?? "border-zinc-600 text-zinc-400";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {t(`sales.types.${type}`) || type}
  </span>;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtKg(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props { customerId?: number; compact?: boolean; }

export default function SalesTable({ customerId, compact = false }: Props) {
  const t = useT();
  const [docs, setDocs]       = useState<SaleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [dateFrom, setFrom]   = useState("");
  const [dateTo, setTo]       = useState("");
  const [status, setStatus]   = useState("all");
  const [saleType, setType]   = useState("all");

  const fetchDocs = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams();
    if (dateFrom)   p.set("from", dateFrom);
    if (dateTo)     p.set("to", dateTo);
    if (customerId) p.set("customer_id", String(customerId));
    if (status   !== "all") p.set("status",    status);
    if (saleType !== "all") p.set("sale_type", saleType);
    const res  = await fetch(`/api/sales${p.size ? "?" + p : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else         setDocs(data as SaleDoc[]);
    setLoading(false);
  }, [dateFrom, dateTo, customerId, status, saleType, t]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? docs.filter((d) =>
          d.doc_number.toLowerCase().includes(q) ||
          d.customer_name.toLowerCase().includes(q) ||
          d.invoice_number.toLowerCase().includes(q))
      : docs;
  }, [docs, search]);

  const stats = useMemo(() => ({
    count:      filtered.length,
    amount_mdl: filtered.reduce((s, d) => s + d.total_amount_mdl, 0),
    kg:         filtered.reduce((s, d) => s + d.total_net_kg, 0),
  }), [filtered]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    docs.forEach((d) => { map[d.status] = (map[d.status] ?? 0) + 1; });
    return map;
  }, [docs]);

  function exportCsv(rows: SaleDoc[]) {
    const headers = [
      t("sales.docNum"), t("sales.docDate"), t("sales.customer"),
      t("common.type"), t("common.status"), t("common.currency"),
      t("common.amount"), `${t("common.amount")} MDL`,
      t("sales.netKg"), t("sales.invoice"),
    ];
    const data = rows.map((r) => [
      r.doc_number, fmtDate(r.doc_date), r.customer_name,
      t(`sales.types.${r.sale_type}`) || r.sale_type,
      t(`sales.statuses.${r.status}`) || r.status,
      r.currency_code || "MDL",
      r.total_amount.toFixed(2).replace(".", ","),
      r.total_amount_mdl.toFixed(2).replace(".", ","),
      r.total_net_kg.toFixed(2).replace(".", ","),
      r.invoice_number,
    ]);
    const csv = [headers, ...data]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const STATUS_TABS = [
    { v: "all",       label: t("common.all"),                      count: docs.length },
    { v: "confirmed", label: t("sales.statuses.confirmed"),        count: statusCounts.confirmed ?? 0 },
    { v: "shipped",   label: t("sales.statuses.shipped"),          count: statusCounts.shipped   ?? 0 },
    { v: "closed",    label: t("sales.statuses.closed"),           count: statusCounts.closed    ?? 0 },
    { v: "draft",     label: t("sales.statuses.draft"),            count: statusCounts.draft     ?? 0 },
    { v: "cancelled", label: t("sales.statuses.cancelled"),        count: statusCounts.cancelled ?? 0 },
  ];

  const colSpan = customerId ? 7 : 8;

  return (
    <div className={compact ? "" : "p-8"}>
      {!compact && (
        <div className="flex items-start justify-between mb-6 gap-4 flex-col acts:flex-row">
          <div>
            <h1 className="text-2xl font-bold">{t("sales.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("sales.subtitle")}</p>
          </div>
          <button onClick={() => exportCsv(filtered)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-sm hover:bg-zinc-800/40 transition shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t("common.export")} CSV
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button key={s.v} onClick={() => setStatus(s.v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition
                ${status === s.v ? "border-zinc-400 bg-zinc-800/50 text-white" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800/20"}`}>
              {s.label} <span className="tabular-nums">{s.count}</span>
            </button>
          ))}
        </div>

        <select value={saleType} onChange={(e) => setType(e.target.value)}
          className="border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition">
          <option value="all">{t("sales.allTypes")}</option>
          <option value="domestic">{t("sales.types.domestic")}</option>
          <option value="export">{t("sales.types.export")}</option>
        </select>

        <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition" />
        <span className="text-zinc-600 text-sm self-center">—</span>
        <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-zinc-500 hover:text-zinc-300">✕</button>
        )}

        {!customerId && (
          <input type="text" placeholder={t("sales.searchPlaceholder")} value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition w-56" />
        )}
      </div>

      {!compact && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label={t("sales.docs")}        value={String(stats.count)} />
          <StatCard label={`${t("common.amount")} (MDL)`} value={fmtMoney(stats.amount_mdl)} suffix="MDL" />
          <StatCard label={t("sales.netKg")}        value={fmtKg(stats.kg)} />
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№ {t("sales.docNum").toUpperCase()}</TableHead>
              <TableHead>{t("sales.docDate").toUpperCase()}</TableHead>
              {!customerId && <TableHead>{t("sales.customer").toUpperCase()}</TableHead>}
              <TableHead>{t("common.type").toUpperCase()}</TableHead>
              <TableHead>{t("common.status").toUpperCase()}</TableHead>
              <TableHead className="text-right">{t("common.amount").toUpperCase()}</TableHead>
              <TableHead className="text-right">{t("sales.netKg").toUpperCase()}</TableHead>
              <TableHead>{t("sales.invoice").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center text-gray-400 py-8">{t("sales.noSales")}</TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id} className="hover:bg-zinc-200 transition-colors">
                <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                <TableCell className="tabular-nums">{fmtDate(d.doc_date)}</TableCell>
                {!customerId && (
                  <TableCell>
                    {d.customer_id
                      ? <Link href={`/customers/${d.customer_id}`} className="transition underline underline-offset-2 decoration-zinc-700">{d.customer_name}</Link>
                      : d.customer_name || "—"}
                  </TableCell>
                )}
                <TableCell><TypeBadge type={d.sale_type} /></TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  <div>{fmtMoney(d.total_amount)} {d.currency_code || "MDL"}</div>
                  {d.currency_code && d.currency_code !== "MDL" && (
                    <div className="text-xs text-zinc-500">≈ {fmtMoney(d.total_amount_mdl)} MDL</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{fmtKg(d.total_net_kg)}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">{d.invoice_number || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-right text-xs text-zinc-500">
          {t("common.showing")}: {filtered.length} — {t("common.amount")}: {fmtMoney(stats.amount_mdl)} MDL — {fmtKg(stats.kg)} кг
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold tabular-nums">
        {value}{suffix && <span className="text-sm text-zinc-400 ml-1">{suffix}</span>}
      </div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
