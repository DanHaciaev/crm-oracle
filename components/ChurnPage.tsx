"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ChurnItem {
  id:          number;
  name:        string;
  curr:        number;
  prev:        number;
  pct:         number;
  last_date:   string | null;
  tg_linked:   boolean;
  app_user_id: number | null;
}

interface ChurnData {
  period:    string;
  threshold: number;
  prev_from: string;
  prev_to:   string;
  curr_from: string;
  curr_to:   string;
  items:     ChurnItem[];
}

function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function pctColor(pct: number) {
  if (pct <= -50) return "text-red-400 font-bold";
  if (pct <= -30) return "text-orange-400 font-semibold";
  if (pct <  0)   return "text-yellow-400";
  return "text-emerald-400";
}
function riskLabel(pct: number) {
  if (pct <= -50) return { label: "Критический", cls: "border-red-500/50 text-red-400 bg-red-500/10" };
  if (pct <= -30) return { label: "Высокий",     cls: "border-orange-500/50 text-orange-400 bg-orange-500/10" };
  return             { label: "Средний",          cls: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" };
}

export default function ChurnPage() {
  const [data, setData]         = useState<ChurnData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [period, setPeriod]     = useState("30d");
  const [threshold, setThreshold] = useState(30);
  const [sending, setSending]   = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setData(null);
    const p = new URLSearchParams({ period, threshold: String(threshold) });
    const res  = await fetch(`/api/churn?${p}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError((json as { error?: string }).error ?? "Ошибка");
    else         setData(json as ChurnData);
    setLoading(false);
  }, [period, threshold]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function sendTelegram(item: ChurnItem) {
    if (!item.tg_linked || !item.app_user_id) return;
    setSending(item.id);
    // Opens inbox for this client — a real "send message" would need a chat API
    // For now we navigate to inbox
    window.open(`/inbox`, "_blank");
    setSending(null);
  }

  const items = data?.items ?? [];
  const critical = items.filter((i) => i.pct <= -50).length;
  const high     = items.filter((i) => i.pct > -50 && i.pct <= -30).length;
  const medium   = items.filter((i) => i.pct > -30).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-col acts:flex-row">
        <div>
          <h1 className="text-2xl font-bold">Риск оттока</h1>
          <p className="text-sm text-gray-500 mt-1">
            Клиенты у которых выручка упала более чем на {threshold}% по сравнению с предыдущим периодом
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period */}
          {[
            { v: "7d",  l: "7 дней" },
            { v: "30d", l: "30 дней" },
            { v: "90d", l: "90 дней" },
            { v: "ytd", l: "С начала года" },
          ].map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-3 py-1.5 rounded-md border text-sm transition ${
                period === p.v ? "border-zinc-400 bg-zinc-800/50 text-white" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800/20"
              }`}>
              {p.l}
            </button>
          ))}
          {/* Threshold */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Порог</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              className="border border-zinc-700 bg-zinc-900 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-zinc-400 transition">
              <option value={15}>-15%</option>
              <option value={20}>-20%</option>
              <option value={30}>-30%</option>
              <option value={50}>-50%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Period info */}
      {data && (
        <div className="text-xs text-zinc-500 mb-5">
          Текущий: {fmtDate(data.curr_from)} — {fmtDate(data.curr_to)} vs Предыдущий: {fmtDate(data.prev_from)} — {fmtDate(data.prev_to)}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Критический риск" value={String(critical)} cls="text-red-400" />
        <StatCard label="Высокий риск"     value={String(high)}     cls="text-orange-400" />
        <StatCard label="Средний риск"     value={String(medium)}   cls="text-yellow-400" />
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>КЛИЕНТ</TableHead>
              <TableHead>УРОВЕНЬ РИСКА</TableHead>
              <TableHead className="text-right">ПРОШЛЫЙ ПЕРИОД</TableHead>
              <TableHead className="text-right">ТЕКУЩИЙ ПЕРИОД</TableHead>
              <TableHead className="text-right">ИЗМЕНЕНИЕ</TableHead>
              <TableHead>ПОСЛЕДНИЙ ЗАКАЗ</TableHead>
              <TableHead className="text-center">TG</TableHead>
              <TableHead className="text-center">ДЕЙСТВИЕ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-10">{error}</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10">
                Клиентов с падением более {threshold}% не найдено
              </TableCell></TableRow>
            ) : items.map((item) => {
              const risk = riskLabel(item.pct);
              return (
                <TableRow key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                  <TableCell className="font-medium">
                    <Link href={`/customers/${item.id}`}
                      className="hover:text-white transition underline underline-offset-2 decoration-zinc-700">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${risk.cls}`}>
                      {risk.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-zinc-400">
                    {fmtMoney(item.prev)} MDL
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fmtMoney(item.curr)} MDL
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${pctColor(item.pct)}`}>
                    {item.pct > 0 ? "+" : ""}{item.pct}%
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtDate(item.last_date)}</TableCell>
                  <TableCell className="text-center">
                    {item.tg_linked
                      ? <span className="text-emerald-400 text-sm">✓</span>
                      : <span className="text-zinc-600 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/customers/${item.id}?tab=sales`}
                        className="px-2.5 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition">
                        Продажи
                      </Link>
                      {item.tg_linked && (
                        <button onClick={() => sendTelegram(item)} disabled={sending === item.id}
                          className="px-2.5 py-1 text-xs rounded-md border border-sky-700 text-sky-400 hover:bg-sky-950/50 transition disabled:opacity-40">
                          {sending === item.id ? "..." : "TG"}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {items.length > 0 && !loading && (
        <div className="mt-3 text-right text-xs text-zinc-500">
          Клиентов в зоне риска: {items.length}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
