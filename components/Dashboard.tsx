/* eslint-disable react-hooks/static-components */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { GripVertical, TrendingUp, TrendingDown, Minus, RefreshCw, Phone } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/locale";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import WinLossWidget from "@/components/WinLossWidget";
import ForecastActualWidget from "@/components/ForecastActualWidget";

type Period   = "7d" | "30d" | "90d" | "ytd";
type SaleType = "all" | "domestic" | "export";
type BlockId  = "revenue_trend" | "top_customers" | "top_items" | "status_pie" | "churn_risk" | "recent_orders" | "monthly_revenue" | "forecast" | "bottleneck" | "expiring_stock" | "win_loss" | "forecast_actual" | "pipeline_velocity";

interface Kpi {
  revenue: number; orders: number; active_customers: number; unread: number;
  revenue_prev: number; orders_prev: number;
}
interface Stats {
  kpi: Kpi;
  revenue_by_day:  { date: string; revenue: number; orders: number }[];
  top_customers:   { name: string; revenue: number; revenue_orig: number | null; currency: string; orders: number }[];
  top_items:       { name: string; revenue: number; weight_kg: number }[];
  order_statuses:  { status: string; count: number }[];
  churn_risk:      { name: string; curr: number; prev: number; pct: number }[];
  recent_orders:   { doc_number: string; doc_date: string; customer_name: string; amount: number; amount_orig: number; currency: string; weight_kg: number; status: string }[];
}

const DEFAULT_BLOCKS: BlockId[] = [
  "monthly_revenue", "forecast", "forecast_actual", "pipeline_velocity", "expiring_stock", "bottleneck", "win_loss", "revenue_trend", "top_customers", "top_items", "status_pie", "churn_risk", "recent_orders",
];

const CHART_COLORS = ["#10b981", "#818cf8", "#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#34d399", "#f97316"];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#60a5fa",
  shipped:   "#fbbf24",
  closed:    "#10b981",
  cancelled: "#fb7185",
  draft:     "#9f9fa9",
};

const fmtNum = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const fmtKg  = (n: number) => `${fmtNum(n)} кг`;

const ttStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#d4d4d8" },
  itemStyle:    { color: "#a1a1aa" },
  cursor:       { fill: "rgba(255,255,255,0.04)" },
};

function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5)
    return <span className="text-sm text-gray-500 flex items-center gap-1"><Minus className="w-3 h-3" />0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-sm flex items-center gap-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, prev, curr, accent }: {
  label: string; value: string; sub?: string;
  prev?: number; curr?: number; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 p-4 flex flex-col gap-1">
      <div className="text-sm text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? "text-gray-700"}`}>{value}</div>
      <div className="flex items-center justify-between mt-1">
        {sub && <span className="text-sm text-gray-400">{sub}</span>}
        {curr !== undefined && prev !== undefined && <Delta curr={curr} prev={prev} />}
      </div>
    </div>
  );
}

function Empty() {
  const t = useT();
  return <p className="text-sm text-gray-400 py-6 text-center">{t("dashboard.noDataPeriod")}</p>;
}

function RevenueTrendChart({ data }: { data: Stats["revenue_by_day"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fill: "black", fontSize: 11 }} tickLine={false} />
        <YAxis tickFormatter={fmtNum} tick={{ fill: "black", fontSize: 11 }} width={70} tickLine={false} axisLine={false} />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [`${fmtNum(Number(v ?? 0))} MDL`, t("dashboard.revenueLabel")]} />
        <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopCustomersChart({ data }: { data: Stats["top_customers"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  const items = [...data].reverse();
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, items.length * 36)}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="black" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtNum} tick={{ fill: "black", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          type="category" dataKey="name" width={130}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
          tick={{ fill: "black", fontSize: 11 }} tickLine={false} axisLine={false}
        />
        <Tooltip
          {...ttStyle}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Stats["top_customers"][0];
            return (
              <div style={ttStyle.contentStyle} className="px-3 py-2 space-y-0.5">
                <div style={ttStyle.labelStyle} className="font-medium mb-1">{d.name}</div>
                {d.revenue_orig != null && d.currency !== "MDL" ? (
                  <>
                    <div style={ttStyle.itemStyle}>{fmtNum(d.revenue_orig)} {d.currency}</div>
                    <div style={{ color: "#d4d4d8" }}>≈ {fmtNum(d.revenue)} MDL</div>
                  </>
                ) : (
                  <div style={ttStyle.itemStyle}>{fmtNum(d.revenue)} MDL</div>
                )}
                <div style={{ color: "#d4d4d8" }}>{d.orders} {t("dashboard.ordersCount")}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="revenue" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopItemsChart({ data }: { data: Stats["top_items"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  const items = [...data].reverse();
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, items.length * 36)}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtKg} tick={{ fill: "black", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          type="category" dataKey="name" width={130}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
          tick={{ fill: "black", fontSize: 11 }} tickLine={false} axisLine={false}
        />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [fmtKg(Number(v ?? 0)), t("dashboard.weightNet")]} />
        <Bar dataKey="weight_kg" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatusPieChart({ data }: { data: Stats["order_statuses"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);
  const label = (status: string) => t(`sales.statuses.${status}`) || status;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width={200} height={200}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%"
            innerRadius={55} outerRadius={85} paddingAngle={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={STATUS_COLORS[d.status] ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            {...ttStyle}
            formatter={(v: unknown, name: unknown) => {
              const num = Number(v ?? 0);
              const key = String(name ?? "");
              return [`${num} (${((num / total) * 100).toFixed(1)}%)`, label(key)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.status] ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-gray-700">{label(d.status)}</span>
            <span className="ml-auto font-mono text-gray-500">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChurnRiskTable({ data }: { data: Stats["churn_risk"] }) {
  const t = useT();
  if (!data.length)
    return <p className="text-sm text-gray-400 py-4">{t("dashboard.noChurnRisk")}</p>;
  return (
    <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("dashboard.client").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("dashboard.prevPeriod").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("dashboard.currPeriod").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("dashboard.change").toUpperCase()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-center font-mono text-gray-500">{fmtNum(r.prev)}</TableCell>
              <TableCell className="text-center font-mono">{fmtNum(r.curr)}</TableCell>
              <TableCell className="text-center font-mono text-red-400">{r.pct.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RecentOrdersTable({ data }: { data: Stats["recent_orders"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  const label = (status: string) => t(`sales.statuses.${status}`) || status;
  return (
    <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("dashboard.number").toUpperCase()}</TableHead>
            <TableHead>{t("common.date").toUpperCase()}</TableHead>
            <TableHead>{t("dashboard.client").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("common.amount").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("dashboard.weightNet").toUpperCase()}</TableHead>
            <TableHead className="text-center">{t("common.status").toUpperCase()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-gray-500">{r.doc_number}</TableCell>
              <TableCell className="whitespace-nowrap text-gray-500">{r.doc_date}</TableCell>
              <TableCell>{r.customer_name}</TableCell>
              <TableCell className="font-mono text-center">
                {r.currency !== "MDL" ? (
                  <>
                    <div>{fmtNum(r.amount_orig)} {r.currency}</div>
                    <div className="text-xs text-gray-400">≈ {fmtNum(r.amount)} MDL</div>
                  </>
                ) : (
                  <div>{fmtNum(r.amount)} MDL</div>
                )}
              </TableCell>
              <TableCell className="font-mono text-center text-zinc-400">{fmtKg(r.weight_kg)}</TableCell>
              <TableCell className="text-center">
                <span
                  className="inline-flex px-2 py-0.5 rounded-full text-[10px] border"
                  style={{
                    color:       STATUS_COLORS[r.status] ?? "#6b7280",
                    borderColor: (STATUS_COLORS[r.status] ?? "#6b7280") + "60",
                  }}
                >
                  {label(r.status)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface MonthlyPoint { month: string; label: string; revenue: number; orders: number; }
interface ForecastData {
  actuals: MonthlyPoint[];
  predicted: { month: string; label: string; revenue: number; forecast: true }[];
  r2: number; trend: "up" | "down"; trend_pct: number;
  forecast_30d: number; forecast_60d: number; forecast_90d: number;
}

function MonthlyRevenueChart() {
  const t = useT();
  const [data, setData] = useState<MonthlyPoint[] | null>(null);
  useEffect(() => {
    fetch("/api/dashboard/monthly")
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setData(d as MonthlyPoint[]); });
  }, []);

  if (!data) return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;
  if (!data.length) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="label" tick={{ fill: "black", fontSize: 11 }} tickLine={false} />
        <YAxis tickFormatter={fmtNum} tick={{ fill: "black", fontSize: 11 }} width={72} tickLine={false} axisLine={false} />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [`${fmtNum(Number(v ?? 0))} MDL`, t("dashboard.revenueLabel")]} />
        <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ForecastWidget() {
  const t = useT();
  const [data, setData] = useState<ForecastData | null>(null);
  useEffect(() => {
    fetch("/api/forecast")
      .then(r => r.json())
      .then((d: unknown) => setData(d as ForecastData));
  }, []);

  if (!data) return <div className="h-48 animate-pulse bg-gray-100 rounded-lg" />;

  const chartData: { label: string; revenue: number; forecast?: number }[] = [
    ...data.actuals.map(a => ({ label: a.label, revenue: a.revenue })),
    ...data.predicted.map(p => ({ label: p.label + "*", revenue: 0, forecast: p.revenue })),
  ];

  const splitIdx = data.actuals.length - 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t("dashboard.forecast30d"), val: data.forecast_30d },
          { label: t("dashboard.forecast60d"), val: data.forecast_60d },
          { label: t("dashboard.forecast90d"), val: data.forecast_90d },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-lg border border-[#c8d3e8] bg-gray-50 p-3 text-center">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-lg font-bold text-emerald-400">{fmtNum(val)}</div>
            <div className="text-[10px] text-gray-400">MDL</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {data.trend === "up"
          ? <TrendingUp className="w-4 h-4 text-emerald-400" />
          : <TrendingDown className="w-4 h-4 text-red-400" />
        }
        <span>{t("dashboard.forecastTrend")}: {data.trend === "up" ? "+" : ""}{data.trend_pct}% {t("dashboard.forecastOverYear")}</span>
        <span className="ml-auto text-gray-500">R²={data.r2}%</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="label" tick={{ fill: "black", fontSize: 10 }} tickLine={false} />
          <YAxis tickFormatter={fmtNum} tick={{ fill: "black", fontSize: 10 }} width={72} tickLine={false} axisLine={false} />
          <Tooltip {...ttStyle} formatter={(v: unknown, name: unknown) => {
            const label = name === "forecast" ? t("dashboard.forecastLabel") : t("dashboard.revenueLabel");
            return [`${fmtNum(Number(v ?? 0))} MDL`, label];
          }} />
          <ReferenceLine x={chartData[splitIdx]?.label} stroke="#4b5563" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="revenue"  stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="forecast" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400">* {t("dashboard.forecastNote")}</p>
    </div>
  );
}

interface BottleneckData {
  leads: { status: string; count: number; max_days: number }[];
  deals: { status: string; count: number; max_days: number }[];
}

const STALE_THRESHOLD = 14;

function BottleneckWidget() {
  const t = useT();
  const [data, setData] = useState<BottleneckData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/bottleneck")
      .then(r => r.json())
      .then((d: unknown) => setData(d as BottleneckData))
      .catch(() => {});
  }, []);

  if (!data) return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;

  const staleLeads = data.leads.filter(l => l.max_days >= STALE_THRESHOLD);
  const staleDeals = data.deals.filter(d => d.max_days >= STALE_THRESHOLD);

  function dayCls(d: number) {
    if (d >= 30) return "text-red-500 font-semibold";
    if (d >= 14) return "text-amber-500";
    return "text-gray-500";
  }

  function StageTable({ rows, labelPrefix }: { rows: typeof staleLeads; labelPrefix: string }) {
    if (!rows.length) return <p className="text-sm text-gray-400 py-1">—</p>;
    return (
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>СТАДИЯ</TableHead>
              <TableHead className="text-center">ШТ.</TableHead>
              <TableHead className="text-center">МАКС. ДНЕЙ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.status}>
                <TableCell>{t(`${labelPrefix}.${r.status}`) || r.status}</TableCell>
                <TableCell className="text-center font-mono">{r.count}</TableCell>
                <TableCell className={`text-center font-mono ${dayCls(r.max_days)}`}>{r.max_days}д</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const totalStale = staleLeads.reduce((s, r) => s + r.count, 0) + staleDeals.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      {totalStale === 0 ? (
        <p className="text-sm text-emerald-500 py-2">✓ Нет застрявших лидов и сделок</p>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-400/40 bg-amber-50 text-amber-700 text-sm">
          ⚠ {totalStale} позиций без движения {STALE_THRESHOLD}+ дней
        </div>
      )}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Лиды (стагнация)</div>
        <StageTable rows={staleLeads} labelPrefix="leadStatuses" />
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Сделки (стагнация)</div>
        <StageTable rows={staleDeals} labelPrefix="sales.statuses" />
      </div>
    </div>
  );
}

interface ExpiringBatch {
  batch_id: number; batch_number: string; item_name: string;
  qty_kg: number; expiry_date: string; days_left: number;
  top_customers: { id: number; name: string }[];
}

function ExpiringStockWidget() {
  const [items, setItems] = useState<ExpiringBatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/expiring")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: ExpiringBatch[]) => setItems(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;

  if (!items.length)
    return <p className="text-sm text-emerald-500 py-2">✓ Нет партий с истекающим сроком — всё в норме</p>;

  function urgency(days: number) {
    if (days <= 3)  return "bg-red-50 border-red-300";
    if (days <= 7)  return "bg-orange-50 border-orange-300";
    return "bg-amber-50 border-amber-200";
  }
  function daysCls(days: number) {
    if (days <= 3)  return "text-red-600 font-bold";
    if (days <= 7)  return "text-orange-600 font-semibold";
    return "text-amber-600";
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300/60 bg-red-50 text-red-700 text-sm">
        ⚠ {items.length} партий истекает в течение 14 дней — нужно срочно продать
      </div>
      {items.map(b => (
        <div key={b.batch_id} className={`rounded-lg border p-3 ${urgency(b.days_left)}`}>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <span className="font-semibold text-sm text-gray-800">{b.item_name}</span>
              <span className="ml-2 text-xs text-gray-500 font-mono">{b.batch_number}</span>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-sm ${daysCls(b.days_left)}`}>{b.days_left}д</div>
              <div className="text-xs text-gray-500">{fmtNum(b.qty_kg)} кг</div>
            </div>
          </div>
          {b.top_customers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-xs text-gray-400">Берут:</span>
              {b.top_customers.map(c => (
                <Link key={c.id} href={`/customers/${c.id}`} className="text-xs text-blue-600 hover:underline">
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type PVData = { stages: { STATUS: string; AVG_DAYS: number; CNT: number }[]; won_cycle: { AVG_CYCLE: number; WON_COUNT: number } | null };

function PipelineVelocityWidget() {
  const t = useT();
  // undefined = loading, null = error/empty, PVData = loaded
  const [data, setData] = useState<PVData | null | undefined>(undefined);

  useEffect(() => {
    const empty: PVData = { stages: [], won_cycle: null };
    fetch("/api/dashboard/pipeline-velocity")
      .then(r => r.ok ? r.json() : empty)
      .then(d => setData(d ?? empty))
      .catch(() => setData(empty));
  }, []);

  const STATUS_COLORS: Record<string, string> = {
    new:       "bg-sky-400",
    contacted: "bg-blue-400",
    qualified: "bg-violet-400",
    proposal:  "bg-amber-400",
  };
  const STATUS_TEXT: Record<string, string> = {
    new:       "text-sky-600",
    contacted: "text-blue-600",
    qualified: "text-violet-600",
    proposal:  "text-amber-600",
  };

  if (data === undefined) return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;

  const stages = data?.stages ?? [];
  const maxDays = Math.max(...stages.map(s => s.AVG_DAYS), 1);

  return (
    <div className="space-y-3">
      {stages.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Нет активных лидов в воронке</p>
      ) : stages.map(s => (
        <div key={s.STATUS}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium ${STATUS_TEXT[s.STATUS] ?? "text-gray-600"}`}>
              {t(`leadStatuses.${s.STATUS}`) || s.STATUS}
              <span className="text-gray-400 font-normal ml-1">({s.CNT} лид.)</span>
            </span>
            <span className="text-xs font-semibold text-gray-700">{s.AVG_DAYS} дн.</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${STATUS_COLORS[s.STATUS] ?? "bg-gray-400"}`}
              style={{ width: `${Math.max(4, (s.AVG_DAYS / maxDays) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {data?.won_cycle && data.won_cycle.WON_COUNT > 0 && (
        <div className={`pt-3 flex items-center justify-between ${stages.length > 0 ? "mt-3 border-t border-gray-100" : ""}`}>
          <div>
            <span className="text-xs text-gray-500">Средний цикл сделки</span>
            <span className="text-xs text-gray-400 ml-1">({data.won_cycle.WON_COUNT} сделок)</span>
          </div>
          <span className="text-sm font-bold text-emerald-600">{data.won_cycle.AVG_CYCLE} дн.</span>
        </div>
      )}
      {!data?.won_cycle && stages.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>
      )}
    </div>
  );
}

function BlockContent({ id, stats }: { id: BlockId; stats: Stats | null }) {
  // These blocks fetch their own data independently
  if (id === "monthly_revenue")    return <MonthlyRevenueChart />;
  if (id === "forecast")           return <ForecastWidget />;
  if (id === "bottleneck")         return <BottleneckWidget />;
  if (id === "expiring_stock")     return <ExpiringStockWidget />;
  if (id === "win_loss")           return <WinLossWidget />;
  if (id === "forecast_actual")    return <ForecastActualWidget />;
  if (id === "pipeline_velocity")  return <PipelineVelocityWidget />;

  if (!stats) return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;
  switch (id) {
    case "revenue_trend": return <RevenueTrendChart data={stats.revenue_by_day} />;
    case "top_customers": return <TopCustomersChart data={stats.top_customers} />;
    case "top_items":     return <TopItemsChart    data={stats.top_items} />;
    case "status_pie":    return <StatusPieChart   data={stats.order_statuses} />;
    case "churn_risk":    return <ChurnRiskTable   data={stats.churn_risk} />;
    case "recent_orders": return <RecentOrdersTable data={stats.recent_orders} />;
  }
}

function SortableBlock({ id, stats, overlay }: { id: BlockId; stats: Stats | null; overlay?: boolean }) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-zinc-800 bg-zinc-300 flex flex-col
        ${isDragging && !overlay ? "opacity-40" : ""}
        ${overlay ? "shadow-2xl shadow-black/60" : ""}
      `}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-800 hover:text-zinc-800 transition p-0.5 rounded"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-800">{t(`dashboard.blocks.${id}`)}</span>
      </div>
      <div className="p-4">
        <BlockContent id={id} stats={stats} />
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border
        ${active
          ? "bg-gray-900 border-gray-700 text-white"
          : "border-[#c8d3e8] text-gray-700 hover:bg-gray-100"
        }`}
    >
      {label}
    </button>
  );
}

interface Recommendation {
  id: number; name: string;
  days_since_last: number; avg_cycle: number; overdue_days: number;
  ltv: number; order_count: number; last_activity: string | null;
  urgency: "high" | "medium" | "low";
}

const URGENCY_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-sky-400",
};

function CallTodayWidget() {
  const t = useT();
  const [items, setItems]     = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations")
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setItems(d as Recommendation[]); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-[#c8d3e8] bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#c8d3e8]">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-800">{t("dashboard.callToday")}</span>
        </div>
        {!loading && items.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-[#c8d3e8] text-gray-500">
            {items.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse bg-gray-200 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{t("dashboard.callTodayEmpty")}</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {items.map((r) => {
            const isOverdue = r.overdue_days > 0;
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition">
                <div className={`w-2 h-2 rounded-full shrink-0 ${URGENCY_DOT[r.urgency]}`} />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/customers/${r.id}`}
                    className="text-sm font-medium text-gray-800 hover:text-gray-900 truncate block"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {isOverdue
                      ? `${t("dashboard.callTodayOverdue")} ${r.overdue_days} ${t("dashboard.callTodayDays")} · ${t("dashboard.callTodayCycle")} ${r.avg_cycle} ${t("dashboard.callTodayDays")}`
                      : `${t("dashboard.callTodaySoon")} ${Math.abs(r.overdue_days)} ${t("dashboard.callTodayDays")} · ${t("dashboard.callTodayCycle")} ${r.avg_cycle} ${t("dashboard.callTodayDays")}`
                    }
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-gray-700">{fmtNum(r.ltv)} MDL</div>
                  <div className="text-xs text-gray-400">{r.order_count} {t("dashboard.callTodayOrders")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const t = useT();
  const [period,    setPeriod]    = useState<Period>("30d");
  const [saleType,  setSaleType]  = useState<SaleType>("all");
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [blocks,    setBlocks]    = useState<BlockId[]>(DEFAULT_BLOCKS);
  const [draggingId,setDraggingId]= useState<BlockId | null>(null);

  useEffect(() => {
    try {
      const saved: BlockId[] = JSON.parse(localStorage.getItem("crm_dash_blocks") ?? "[]");
      if (saved.length) {
        const merged = [
          ...saved.filter(id => DEFAULT_BLOCKS.includes(id)),
          ...DEFAULT_BLOCKS.filter(id => !saved.includes(id)),
        ];
        setBlocks(merged);
      }
    } catch { }
  }, []);

  const fetchStats = useCallback(() => {
    setLoading(true); setFetchErr(null); setStats(null);
    fetch(`/api/dashboard/stats?period=${period}&saleType=${saleType}`)
      .then(r => r.json())
      .then((data: Stats & { error?: string }) => {
        if (data.error) setFetchErr(data.error);
        else setStats(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setFetchErr(e instanceof Error ? e.message : t("dashboard.fetchError"));
        setLoading(false);
      });
  }, [period, saleType, t]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart({ active }: DragStartEvent) { setDraggingId(active.id as BlockId); }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    setBlocks(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id as BlockId), prev.indexOf(over.id as BlockId));
      localStorage.setItem("crm_dash_blocks", JSON.stringify(next));
      return next;
    });
  }

  const kpi = stats?.kpi;

  const PERIOD_LABELS: Record<Period, string> = {
    "7d":  t("dashboard.periods.d7"),
    "30d": t("dashboard.periods.d30"),
    "90d": t("dashboard.periods.d90"),
    "ytd": t("dashboard.periods.ytd"),
  };
  const SALETYPE_LABELS: Record<SaleType, string> = {
    all:      t("dashboard.saleTypes.all"),
    domestic: t("dashboard.saleTypes.domestic"),
    export:   t("dashboard.saleTypes.export"),
  };

  return (
    <div className="p-4 sm:p-8 space-y-5 mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-800 mr-1">{t("dashboard.period")}:</span>
          {(["7d", "30d", "90d", "ytd"] as Period[]).map(p => (
            <FilterChip key={p} label={PERIOD_LABELS[p]} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-800 mr-1">{t("dashboard.type")}:</span>
          {(["all", "domestic", "export"] as SaleType[]).map(s => (
            <FilterChip key={s} label={SALETYPE_LABELS[s]} active={saleType === s} onClick={() => setSaleType(s)} />
          ))}
          <button
            onClick={fetchStats}
            className="ml-2 p-1.5 rounded-lg border border-zinc-800 text-zinc-800 hover:bg-zinc-200 transition"
            title={t("common.refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => { localStorage.removeItem("crm_dash_blocks"); setBlocks(DEFAULT_BLOCKS); }}
            className="ml-1 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-zinc-800 hover:bg-zinc-200 transition text-xs"
            title={t("dashboard.resetLayout")}
          >
            {t("dashboard.resetLayout")}
          </button>
        </div>
      </div>

      {fetchErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="font-medium">{t("dashboard.fetchError")}:</span> {fetchErr}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label={t("dashboard.revenue")}
          value={kpi ? fmtNum(kpi.revenue) : "—"}
          sub="MDL"
          curr={kpi?.revenue}
          prev={kpi?.revenue_prev}
          accent="text-emerald-400"
        />
        <KpiCard
          label={t("dashboard.orders")}
          value={kpi ? String(kpi.orders) : "—"}
          curr={kpi?.orders}
          prev={kpi?.orders_prev}
        />
        <KpiCard
          label={t("dashboard.activeCustomers")}
          value={kpi ? String(kpi.active_customers) : "—"}
          sub={t("dashboard.activeSub")}
        />
        <KpiCard
          label={t("notifications.unreadMessages")}
          value={kpi ? String(kpi.unread) : "—"}
          sub={t("dashboard.unreadSub")}
          accent={kpi && kpi.unread > 0 ? "text-amber-400" : undefined}
        />
      </div>

      <CallTodayWidget />

      <DndContext
        id="dashboard-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {blocks.map(id => (
              <SortableBlock key={id} id={id} stats={stats} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {draggingId ? <SortableBlock id={draggingId} stats={stats} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
