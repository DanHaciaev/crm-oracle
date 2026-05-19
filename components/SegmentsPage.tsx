/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface SegCustomer {
  id: number; code: string; name: string; country: string | null;
  customer_type: string | null; contact_phone: string | null;
  segment: string; total_revenue: number; total_revenue_orig: number | null;
  currency_code: string; last_order_date: string | null;
  order_count: number; tg_linked: boolean;
  rfm_r: number | null; rfm_f: number; rfm_m: number;
}

function RfmCell({ r, f, m }: { r: number | null; f: number; m: number }) {
  const t = useT();
  if (r === null && f === 0 && m === 0)
    return <span className="text-gray-400 text-sm">—</span>;
  const rCls = r === null ? "text-gray-400"
    : r <= 30  ? "text-emerald-800"
    : r <= 90  ? "text-amber-400"
    : "text-red-400";
  return (
    <div className="text-sm tabular-nums space-y-0.5">
      <div className={rCls} title={t("rfm.r")}>R: {r ?? "—"}</div>
      <div className="text-gray-400" title={t("rfm.f")}>F: {f}</div>
      <div className="text-gray-400" title={t("rfm.m")}>
        M: {m > 0 ? `${(m / 1000).toFixed(0)}k` : "0"}
      </div>
    </div>
  );
}

const SEG_CLS: Record<string, string> = {
  vip:      "border-amber-500/50 text-amber-400 bg-amber-500/10",
  new:      "border-sky-500/50 text-sky-400 bg-sky-500/10",
  active:   "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
  sleeping: "border-orange-500/50 text-orange-400 bg-orange-500/10",
  churned:  "border-red-500/50 text-red-400 bg-red-500/10",
  no_orders:"border-gray-800 text-gray-500 bg-gray-100",
};

function SegBadge({ seg }: { seg: string }) {
  const t   = useT();
  const cls = SEG_CLS[seg] ?? "border-gray-800 text-gray-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium border ${cls}`}>
      {t(`segments.${seg}`) || seg}
    </span>
  );
}

function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SegmentsPage() {
  const t = useT();
  const [customers, setCustomers] = useState<SegCustomer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [segment, setSegment]     = useState("all");
  const [search, setSearch]       = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/customers/segments");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setCustomers(data as SegCustomer[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: customers.length };
    customers.forEach(c => { m[c.segment] = (m[c.segment] ?? 0) + 1; });
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      const matchSeg    = segment === "all" || c.segment === segment;
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      return matchSeg && matchSearch;
    });
  }, [customers, segment, search]);

  const SEG_BUTTONS = [
    { v: "all",      cls: "text-gray-500" },
    { v: "vip",      cls: "text-amber-400" },
    { v: "new",      cls: "text-sky-400" },
    { v: "active",   cls: "text-emerald-400" },
    { v: "sleeping", cls: "text-orange-400" },
    { v: "churned",  cls: "text-red-400" },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("segments.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("segments.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {SEG_BUTTONS.map(s => (
          <button key={s.v} onClick={() => setSegment(s.v)}
            className={`border rounded-xl p-3 text-center transition ${
              segment === s.v ? "border-gray-800 bg-gray-100" : "border-gray-800 hover:border-gray-800"
            }`}>
            <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>{counts[s.v] ?? 0}</div>
            <div className="text-sm text-gray-500 mt-0.5">{t(`segments.${s.v}`)}</div>
          </button>
        ))}
      </div>

      {segment !== "all" && (
        <div className="text-sm text-gray-400 mb-4">
          {t(`segments.${segment}Desc`)}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder={t("common.search")}
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition w-56"
        />
        {segment !== "all" && (
          <Link href={`/broadcasts?segment=${segment}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-sky-700 text-sky-400 hover:bg-sky-950/40 transition">
            ✉ {t("segments.broadcastLink")}
          </Link>
        )}
        {(search || segment !== "all") && (
          <button onClick={() => { setSearch(""); setSegment("all"); }}
            className="text-sm text-gray-400 hover:text-gray-700 transition">
            {t("common.reset")}
          </button>
        )}
      </div>

      <div className="border border-gray-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("segments.cols.customer")}</TableHead>
              <TableHead>{t("segments.cols.segment")}</TableHead>
              <TableHead>{t("segments.cols.countryType")}</TableHead>
              <TableHead className="text-center">{t("segments.cols.revenue")}</TableHead>
              <TableHead className="text-center">{t("segments.cols.orders")}</TableHead>
              <TableHead>{t("segments.cols.lastOrder")}</TableHead>
              <TableHead className="text-center">{t("segments.cols.rfm")}</TableHead>
              <TableHead className="text-center">{t("segments.cols.tg")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-8">{t("common.noResults")}</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`}
                    className="transition underline underline-offset-2 decoration-gray-300 hover:text-gray-900">
                    {c.name}
                  </Link>
                  <div className="text-sm text-gray-400 font-mono">{c.code}</div>
                </TableCell>
                <TableCell><SegBadge seg={c.segment} /></TableCell>
                <TableCell className="text-sm text-gray-500">
                  {c.country && <div>{c.country}</div>}
                  {c.customer_type && <div>{c.customer_type}</div>}
                </TableCell>
                <TableCell className="text-center font-mono tabular-nums">
                  {c.total_revenue > 0 ? (
                    <>
                      {c.total_revenue_orig != null && c.currency_code !== "MDL" ? (
                        <>
                          <div>{fmtMoney(c.total_revenue_orig)} {c.currency_code}</div>
                          <div className="text-sm text-gray-400">≈ {fmtMoney(c.total_revenue)} MDL</div>
                        </>
                      ) : (
                        <div>{fmtMoney(c.total_revenue)} MDL</div>
                      )}
                    </>
                  ) : <span className="text-gray-400">—</span>}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {c.order_count > 0 ? c.order_count : <span className="text-gray-400">0</span>}
                </TableCell>
                <TableCell className="text-sm tabular-nums">{fmtDate(c.last_order_date)}</TableCell>
                <TableCell className="text-center">
                  <RfmCell r={c.rfm_r} f={c.rfm_f} m={c.rfm_m} />
                </TableCell>
                <TableCell className="text-center">
                  {c.tg_linked
                    ? <span className="text-emerald-800 text-sm">✓</span>
                    : <span className="text-gray-400 text-sm">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-center text-sm text-gray-400">
          {t("common.showing")}: {filtered.length} {t("common.of")} {customers.length}
        </div>
      )}
    </div>
  );
}
