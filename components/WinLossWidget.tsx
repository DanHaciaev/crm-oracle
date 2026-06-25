"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useT } from "@/lib/locale";

interface WinLossData {
  won:      number;
  lost:     number;
  total:    number;
  win_rate: number;
  by_reason: { reason: string; count: number }[];
}

const REASON_COLORS = ["#fb7185", "#f97316", "#fbbf24", "#818cf8", "#38bdf8", "#a78bfa"];

const ttStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#d4d4d8" },
  itemStyle:    { color: "#a1a1aa" },
  cursor:       { fill: "rgba(255,255,255,0.04)" },
};

export default function WinLossWidget() {
  const t = useT();
  const [data, setData] = useState<WinLossData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads/winloss")
      .then(r => r.json())
      .then(d => { setData(d as WinLossData); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        {t("common.loading")}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        {t("common.noData")}
      </div>
    );
  }

  const chartData = data.by_reason
    .filter(r => r.reason)
    .map(r => ({
      name:  t(`leads.lossReasons.${r.reason}`) || r.reason,
      count: r.count,
    }));

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-3xl font-bold text-emerald-500">{data.win_rate}%</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Win Rate</div>
        </div>
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-3xl font-bold text-emerald-600">{data.won}</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Won</div>
        </div>
        <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{data.lost}</div>
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Lost</div>
        </div>
      </div>

      {/* Win rate bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span className="text-emerald-500">Won</span>
          <span className="text-red-400">Lost</span>
        </div>
        <div className="h-2.5 rounded-full bg-red-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${data.win_rate}%` }}
          />
        </div>
      </div>

      {/* Loss reasons bar chart */}
      {chartData.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
            {t("leads.lossReason")}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category" dataKey="name" width={110}
                tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + "…" : v}
              />
              <Tooltip
                {...ttStyle}
                formatter={(v: unknown) => [String(v), t("leads.lossReason")]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
