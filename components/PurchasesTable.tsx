/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Printer, FileText } from "lucide-react";
import { useT } from "@/lib/locale";
import { useUrlParam } from "@/hooks/useUrlParam";

interface PurchaseDoc {
  id:                number;
  doc_number:        string;
  doc_date:          string | null;
  supplier_name:     string;
  supplier_id:       number | null;
  warehouse_name:    string;
  status:            string;
  total_gross_kg:    number;
  total_net_kg:      number;
  total_amount:      number;
  total_amount_mdl:  number;
  currency_code:     string;
  is_own_production: boolean;
}

const STATUS_CLS: Record<string, string> = {
  draft:     "border-[#c8d3e8] text-gray-500 bg-gray-100",
  confirmed: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  closed:    "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  cancelled: "border-red-500/40 text-red-400 bg-red-500/10",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtKg(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const t   = useT();
  const cls = STATUS_CLS[status] ?? "border-[#c8d3e8] text-gray-500";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {t(`purchases.statuses.${status}`) || status}
  </span>;
}

export default function PurchasesTable() {
  const t = useT();
  const [docs, setDocs]       = useState<PurchaseDoc[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  useUrlParam("q", setSearch);
  const [dateFrom, setFrom]   = useState("");
  const [dateTo, setTo]       = useState("");
  const [status, setStatus]   = useState("all");

  const fetchDocs = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo)   params.set("to", dateTo);
    if (status !== "all") params.set("status", status);
    params.set("page", String(p));
    const res  = await fetch(`/api/purchases?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError((data as { error?: string }).error ?? t("common.error")); }
    else {
      const d = data as { docs: PurchaseDoc[]; total: number; page: number; pages: number; status_counts: Record<string, number> };
      setDocs(d.docs);
      setTotal(d.total);
      setPage(d.page);
      setPages(d.pages);
      setStatusCounts(d.status_counts ?? {});
    }
    setLoading(false);
  }, [dateFrom, dateTo, status, t]);

  useEffect(() => { setPage(1); fetchDocs(1); }, [fetchDocs]);
  function goToPage(p: number) { setPage(p); fetchDocs(p); }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? docs.filter((d) =>
          d.doc_number.toLowerCase().includes(q) ||
          d.supplier_name.toLowerCase().includes(q))
      : docs;
  }, [docs, search]);

  const stats = useMemo(() => ({
    count:      filtered.length,
    amount_mdl: filtered.reduce((s, d) => s + d.total_amount_mdl, 0),
    kg:         filtered.reduce((s, d) => s + d.total_net_kg, 0),
  }), [filtered]);

  const STATUS_TABS = [
    { v: "all",       label: t("common.all"),                    count: total },
    { v: "confirmed", label: t("purchases.statuses.confirmed"),  count: statusCounts.confirmed ?? 0 },
    { v: "closed",    label: t("purchases.statuses.closed"),     count: statusCounts.closed    ?? 0 },
    { v: "draft",     label: t("purchases.statuses.draft"),      count: statusCounts.draft     ?? 0 },
    { v: "cancelled", label: t("purchases.statuses.cancelled"),  count: statusCounts.cancelled ?? 0 },
  ];

  return (
    <div>
      <div className="px-4 sm:px-8 pt-6 pb-4 border-b border-[#c8d3e8] flex items-start justify-between gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("purchases.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("purchases.subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end px-4 sm:px-8 py-4 border-b border-[#c8d3e8]">
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button key={s.v} onClick={() => setStatus(s.v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm transition
                ${status === s.v
                  ? "border-brand/40 bg-brand/10 text-brand font-medium"
                  : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
              {s.label} <span className="tabular-nums text-xs opacity-70">{s.count}</span>
            </button>
          ))}
        </div>

        <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition" />
        <span className="text-gray-400 text-sm self-center">—</span>
        <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-gray-400 hover:text-gray-700">✕</button>
        )}

        <input type="text" placeholder={t("purchases.searchPlaceholder")} value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition w-full sm:w-56" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-8 py-4">
        <StatCard label={t("purchases.docs")}            value={String(stats.count)} />
        <StatCard label={`${t("common.amount")} (MDL)`}  value={fmtMoney(stats.amount_mdl)} suffix="MDL" />
        <StatCard label={t("suppliers.netKg")}            value={fmtKg(stats.kg)} />
      </div>

      {/* List */}
      <div className="px-4 sm:px-8 pb-8">
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№ {t("suppliers.docNumber").toUpperCase()}</TableHead>
                <TableHead>{t("suppliers.docDate").toUpperCase()}</TableHead>
                <TableHead>{t("purchases.supplier").toUpperCase()}</TableHead>
                <TableHead className="hidden md:table-cell">{t("purchases.warehouse").toUpperCase()}</TableHead>
                <TableHead>{t("common.status").toUpperCase()}</TableHead>
                <TableHead className="text-center">{t("common.amount").toUpperCase()}</TableHead>
                <TableHead className="hidden sm:table-cell text-center">{t("sales.netKg").toUpperCase()}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("purchases.noPurchases")}</TableCell></TableRow>
              ) : filtered.map((d) => (
                <TableRow key={d.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                  <TableCell className="tabular-nums">{fmtDate(d.doc_date)}</TableCell>
                  <TableCell>
                    {d.supplier_id
                      ? <Link href={`/suppliers/${d.supplier_id}`} className="transition underline underline-offset-2 decoration-gray-300 hover:text-gray-900">{d.supplier_name}</Link>
                      : d.supplier_name || "—"}
                    {d.is_own_production && (
                      <div className="text-xs text-gray-400 mt-0.5">{t("purchases.ownProduction")}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{d.warehouse_name || "—"}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    <div>{fmtMoney(d.total_amount)} {d.currency_code || "MDL"}</div>
                    {d.currency_code && d.currency_code !== "MDL" && (
                      <div className="text-sm text-gray-400">≈ {fmtMoney(d.total_amount_mdl)} MDL</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center font-mono tabular-nums">{fmtKg(d.total_net_kg)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/purchases/${d.id}/print`}
                      target="_blank"
                      title={t("purchases.print")}
                      className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
                    >
                      <Printer className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/documents/print/purchase_act?id=${d.id}`}
                      target="_blank"
                      title={t("documents.purchaseAct")}
                      className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
                    >
                      <FileText className="w-4 h-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!loading && total > 0 && (
          <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-gray-400">
              {t("common.showing")}: {filtered.length} / {total} — {t("common.amount")}: {fmtMoney(stats.amount_mdl)} MDL — {fmtKg(stats.kg)} кг
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                >←</button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…"
                      ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                      : <button key={p}
                          onClick={() => goToPage(p as number)}
                          className={`px-2.5 py-1 rounded border text-sm transition ${
                            page === p ? "bg-gray-900 border-gray-700 text-white" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-100"
                          }`}
                        >{p}</button>
                  )
                }
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= pages}
                  className="px-2 py-1 rounded border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                >→</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 bg-white">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums text-gray-900">
        {value}{suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
