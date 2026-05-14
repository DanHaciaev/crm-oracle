/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface SegCustomer {
  id: number; code: string; name: string; country: string | null;
  customer_type: string | null; contact_phone: string | null;
  segment: string; total_revenue: number; total_revenue_orig: number | null;
  currency_code: string; last_order_date: string | null;
  order_count: number; tg_linked: boolean;
}

const SEGMENT_CFG: Record<string, { label: string; cls: string; desc: string }> = {
  vip:      { label: "VIP",      cls: "border-amber-500/50 text-amber-400 bg-amber-500/10",   desc: "≥ 50 000 MDL за 90 дней" },
  new:      { label: "Новые",    cls: "border-sky-500/50 text-sky-400 bg-sky-500/10",          desc: "Первый заказ < 30 дней" },
  active:   { label: "Активные", cls: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10", desc: "Заказ в последние 60 дней" },
  sleeping: { label: "Спящие",   cls: "border-orange-500/50 text-orange-400 bg-orange-500/10", desc: "60–180 дней без заказа" },
  churned:  { label: "Ушедшие",  cls: "border-red-500/50 text-red-400 bg-red-500/10",         desc: "> 180 дней без заказа" },
  no_orders:{ label: "Нет заказов", cls: "border-zinc-600 text-zinc-500 bg-zinc-300",       desc: "Ни одного заказа" },
};

function SegBadge({ seg }: { seg: string }) {
  const cfg = SEGMENT_CFG[seg] ?? { label: seg, cls: "border-zinc-600 text-zinc-400" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
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
  const [customers, setCustomers] = useState<SegCustomer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [segment, setSegment]     = useState("all");
  const [search, setSearch]       = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/customers/segments");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setCustomers(data as SegCustomer[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: customers.length };
    customers.forEach(c => { m[c.segment] = (m[c.segment] ?? 0) + 1; });
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      const matchSeg = segment === "all" || c.segment === segment;
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      return matchSeg && matchSearch;
    });
  }, [customers, segment, search]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Сегментация клиентов</h1>
        <p className="text-sm text-zinc-500 mt-1">Автоматическое разбиение по активности и выручке</p>
      </div>

      {/* Segment stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { v: "all",       label: "Все",        cls: "text-zinc-400" },
          { v: "vip",       label: "VIP",        cls: "text-amber-400" },
          { v: "new",       label: "Новые",      cls: "text-sky-400" },
          { v: "active",    label: "Активные",   cls: "text-emerald-400" },
          { v: "sleeping",  label: "Спящие",     cls: "text-orange-400" },
          { v: "churned",   label: "Ушедшие",    cls: "text-red-400" },
        ].map(s => (
          <button key={s.v} onClick={() => setSegment(s.v)}
            className={`border rounded-xl p-3 text-center transition ${
              segment === s.v ? "border-zinc-500 bg-zinc-200" : "border-zinc-800 hover:border-zinc-700"
            }`}>
            <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>{counts[s.v] ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Segment description */}
      {segment !== "all" && SEGMENT_CFG[segment] && (
        <div className="text-xs text-zinc-500 mb-4">
          {SEGMENT_CFG[segment].desc}
        </div>
      )}

      {/* Search + broadcast link */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder="Поиск..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition w-56"
        />
        {segment !== "all" && (
          <Link href={`/broadcasts?segment=${segment}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-sky-700 text-sky-400 hover:bg-sky-950/40 transition">
            ✉ Рассылка по сегменту
          </Link>
        )}
        {(search || segment !== "all") && (
          <button onClick={() => { setSearch(""); setSegment("all"); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            Сбросить
          </button>
        )}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>КЛИЕНТ</TableHead>
              <TableHead>СЕГМЕНТ</TableHead>
              <TableHead>СТРАНА / ТИП</TableHead>
              <TableHead className="text-right">ВЫРУЧКА ВСЕГО</TableHead>
              <TableHead className="text-center">ЗАКАЗОВ</TableHead>
              <TableHead>ПОСЛЕДНИЙ ЗАКАЗ</TableHead>
              <TableHead className="text-center">TG</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-8">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-400 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-zinc-600 py-8">Клиентов не найдено</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id} className="hover:bg-zinc-100 transition-colors">
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`}
                    className="transition underline underline-offset-2 decoration-zinc-700">
                    {c.name}
                  </Link>
                  <div className="text-xs text-zinc-600 font-mono">{c.code}</div>
                </TableCell>
                <TableCell><SegBadge seg={c.segment} /></TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {c.country && <div>{c.country}</div>}
                  {c.customer_type && <div>{c.customer_type}</div>}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {c.total_revenue > 0 ? (
                    <>
                      {c.total_revenue_orig != null && c.currency_code !== "MDL" ? (
                        <>
                          <div>{fmtMoney(c.total_revenue_orig)} {c.currency_code}</div>
                          <div className="text-xs text-zinc-500">≈ {fmtMoney(c.total_revenue)} MDL</div>
                        </>
                      ) : (
                        <div>{fmtMoney(c.total_revenue)} MDL</div>
                      )}
                    </>
                  ) : <span className="text-zinc-600">—</span>}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {c.order_count > 0 ? c.order_count : <span className="text-zinc-600">0</span>}
                </TableCell>
                <TableCell className="text-sm tabular-nums">{fmtDate(c.last_order_date)}</TableCell>
                <TableCell className="text-center">
                  {c.tg_linked
                    ? <span className="text-emerald-400 text-sm">✓</span>
                    : <span className="text-zinc-600 text-xs">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-right text-xs text-zinc-500">
          Показано: {filtered.length} из {customers.length}
        </div>
      )}
    </div>
  );
}
