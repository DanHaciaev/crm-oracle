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
  PieChart, Pie, Cell,
} from "recharts";
import { GripVertical, TrendingUp, TrendingDown, Minus, RefreshCw, Phone } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/locale";

type Period   = "7d" | "30d" | "90d" | "ytd";
type SaleType = "all" | "domestic" | "export";
type BlockId  = "revenue_trend" | "top_customers" | "top_items" | "status_pie" | "churn_risk" | "recent_orders";

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
  "revenue_trend", "top_customers", "top_items", "status_pie", "churn_risk", "recent_orders",
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
    <div className="rounded-xl border border-gray-800 bg-gray-50 p-4 flex flex-col gap-1">
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600 text-sm border-b border-gray-800">
            <th className="pb-2 font-medium">{t("dashboard.client")}</th>
            <th className="pb-2 font-medium text-center">{t("dashboard.prevPeriod")}</th>
            <th className="pb-2 font-medium text-center">{t("dashboard.currPeriod")}</th>
            <th className="pb-2 font-medium text-center">{t("dashboard.change")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-gray-800 hover:bg-gray-50 transition">
              <td className="py-2.5 pr-4 font-medium text-gray-800">{r.name}</td>
              <td className="py-2.5 pr-4 text-center text-gray-500 font-mono">{fmtNum(r.prev)}</td>
              <td className="py-2.5 pr-4 text-center text-gray-700 font-mono">{fmtNum(r.curr)}</td>
              <td className="py-2.5 text-center font-mono text-red-400">{r.pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentOrdersTable({ data }: { data: Stats["recent_orders"] }) {
  const t = useT();
  if (!data.length) return <Empty />;
  const label = (status: string) => t(`sales.statuses.${status}`) || status;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-center text-gray-800 text-sm border-b border-gray-800">
            <th className="pb-2 font-medium">{t("dashboard.number")}</th>
            <th className="pb-2 font-medium">{t("common.date")}</th>
            <th className="pb-2 font-medium">{t("dashboard.client")}</th>
            <th className="pb-2 font-medium">{t("common.amount")}</th>
            <th className="pb-2 font-medium">{t("dashboard.weightNet")}</th>
            <th className="pb-2 font-medium">{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-gray-800 hover:bg-gray-200 transition text-center">
              <td className="py-2.5 pr-4 font-mono text-gray-600 text-sm">{r.doc_number}</td>
              <td className="py-2.5 pr-4 text-gray-500 text-sm whitespace-nowrap">{r.doc_date}</td>
              <td className="py-2.5 pr-4 text-gray-800">{r.customer_name}</td>
              <td className="py-2.5 pr-4 font-mono text-gray-700 text-center">
                {r.currency !== "MDL" ? (
                  <>
                    <div>{fmtNum(r.amount_orig)} {r.currency}</div>
                    <div className="text-sm text-gray-400">≈ {fmtNum(r.amount)} MDL</div>
                  </>
                ) : (
                  <div>{fmtNum(r.amount)} MDL</div>
                )}
              </td>
              <td className="py-2.5 pr-4 font-mono text-zinc-400">{fmtKg(r.weight_kg)}</td>
              <td className="py-2.5">
                <span
                  className="inline-flex px-2 py-0.5 rounded-full text-[10px] border text-zinc-100"
                  style={{
                    color:       STATUS_COLORS[r.status] ?? "#f4f5f5",
                    borderColor: (STATUS_COLORS[r.status] ?? "#f4f5f5") + "60",
                  }}
                >
                  {label(r.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockContent({ id, stats }: { id: BlockId; stats: Stats | null }) {
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
          : "border-gray-800 text-gray-700 hover:bg-gray-100"
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
    <div className="rounded-xl border border-gray-800 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-800">{t("dashboard.callToday")}</span>
        </div>
        {!loading && items.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-gray-800 text-gray-500">
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
