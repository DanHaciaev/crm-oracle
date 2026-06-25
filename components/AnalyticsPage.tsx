/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";

interface TopItem {
  item_id:   number;
  item_name: string;
  total_kg:       number;
  total_mdl:      number;
  doc_count:      number;
  avg_sale_price: number | null;
  avg_cost_price: number | null;
  margin_pct:     number | null;
}

interface MonthRow {
  item_id:   number;
  item_name: string;
  mon:       string;
  kg:        number;
  mdl:       number;
}

const PALETTE = [
  "#6366f1","#f59e0b","#10b981","#3b82f6","#ef4444",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

const ttStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#d4d4d8" },
  itemStyle:    { color: "#e4e4e7" },
};

function fmtKg(n: number) { return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " кг"; }
function fmtMoney(n: number) { return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " MDL"; }

function buildMonthlyMatrix(monthly: MonthRow[], topItems: TopItem[]) {
  const months = [...new Set(monthly.map(r => r.mon))].sort();
  const itemIds = topItems.map(i => i.item_id);

  return months.map(mon => {
    const entry: Record<string, string | number> = { mon };
    for (const id of itemIds) {
      const row = monthly.find(r => r.mon === mon && r.item_id === id);
      const name = topItems.find(i => i.item_id === id)?.item_name ?? String(id);
      entry[name] = row?.kg ?? 0;
    }
    return entry;
  });
}

function fmtMon(s: string) {
  const [y, m] = s.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export default function AnalyticsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [months, setMonths]   = useState(12);
  const [topN, setTopN]       = useState(8);
  const [metric, setMetric]   = useState<"kg" | "mdl">("kg");
  const [top, setTop]         = useState<TopItem[]>([]);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/products?months=${months}&top=${topN}`)
      .then(r => r.json())
      .then(d => { setTop(d.top ?? []); setMonthly(d.monthly ?? []); })
      .catch(() => { setTop([]); setMonthly([]); })
      .finally(() => setLoading(false));
  }, [months, topN]);

  const matrix = buildMonthlyMatrix(monthly, top);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {!hideHeader && (
        <div className="px-4 sm:px-8 pt-6 pb-4 bg-white border-b border-[#c8d3e8]">
          <h1 className="text-2xl font-bold text-gray-900">Аналитика по товарам</h1>
          <p className="text-sm text-gray-500 mt-1">Топ позиций по объёму и динамика по месяцам</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center px-4 sm:px-8 py-4 bg-white border-b border-[#c8d3e8]">
        <div>
          <label className="text-xs text-gray-500 mr-2">Период</label>
          {([3, 6, 12, 24] as const).map(m => (
            <button key={m} onClick={() => setMonths(m)}
              className={`px-3 py-1 rounded-lg text-sm border mr-1 transition ${months === m ? "bg-gray-900 text-white border-gray-900" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
              {m} мес
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500 mr-2">Топ</label>
          {([5, 8, 10] as const).map(n => (
            <button key={n} onClick={() => setTopN(n)}
              className={`px-3 py-1 rounded-lg text-sm border mr-1 transition ${topN === n ? "bg-gray-900 text-white border-gray-900" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
              {n}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500 mr-2">Метрика</label>
          <button onClick={() => setMetric("kg")}
            className={`px-3 py-1 rounded-lg text-sm border mr-1 transition ${metric === "kg" ? "bg-gray-900 text-white border-gray-900" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
            кг
          </button>
          <button onClick={() => setMetric("mdl")}
            className={`px-3 py-1 rounded-lg text-sm border transition ${metric === "mdl" ? "bg-gray-900 text-white border-gray-900" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
            MDL
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-gray-400 py-20">Загрузка...</div>
        ) : top.length === 0 ? (
          <div className="text-center text-gray-400 py-20">Нет данных за выбранный период</div>
        ) : (
          <>
            {/* Top products horizontal bar */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                Топ {top.length} товаров за {months} мес.
              </h2>
              <ResponsiveContainer width="100%" height={Math.max(top.length * 44, 200)}>
                <BarChart data={[...top].reverse()} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={metric === "kg" ? (v) => `${(v/1000).toFixed(0)}т` : (v) => `${(v/1000000).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="item_name" width={180}
                    tick={{ fontSize: 12, fill: "#374151" }} />
                  <Tooltip {...ttStyle}
                    formatter={(v) => metric === "kg" ? fmtKg(Number(v)) : fmtMoney(Number(v))}
                    labelFormatter={(l) => String(l)} />
                  <Bar dataKey={metric === "kg" ? "total_kg" : "total_mdl"} fill="#6366f1" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly trend */}
            {matrix.length > 1 && (
              <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">
                  Динамика по месяцам ({metric === "kg" ? "кг" : "MDL"})
                </h2>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={matrix} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#f0f0f0" />
                    <XAxis dataKey="mon" tickFormatter={fmtMon} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickFormatter={metric === "kg" ? (v) => `${(v/1000).toFixed(0)}т` : (v) => `${(v/1000000).toFixed(1)}M`} />
                    <Tooltip {...ttStyle}
                      labelFormatter={(l) => fmtMon(String(l))}
                      formatter={(v) => metric === "kg" ? fmtKg(Number(v)) : fmtMoney(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {top.map((item, idx) => (
                      <Line
                        key={item.item_id}
                        type="monotone"
                        dataKey={item.item_name}
                        stroke={PALETTE[idx % PALETTE.length]}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary table */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8edf5] bg-gray-50/60">
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">#</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Товар</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Объём, кг</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Сумма, MDL</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Отгрузок</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f4fb]">
                  {top.map((item, idx) => (
                    <tr key={item.item_id} className="hover:bg-gray-50/50 transition">
                      <td className="px-5 py-3 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[idx % PALETTE.length] }} />
                          <span className="font-medium text-gray-800">{item.item_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-gray-700">{fmtKg(item.total_kg)}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-gray-700">{fmtMoney(item.total_mdl)}</td>
                      <td className="px-5 py-3 text-right text-gray-500">{item.doc_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
