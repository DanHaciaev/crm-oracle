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
import { GripVertical, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Period = "7d" | "30d" | "90d" | "ytd";
type SaleType = "all" | "domestic" | "export";
type BlockId = "revenue_trend" | "top_customers" | "top_items" | "status_pie" | "churn_risk" | "recent_orders";

interface Kpi {
  revenue: number; orders: number; active_customers: number; unread: number;
  revenue_prev: number; orders_prev: number;
}
interface Stats {
  kpi: Kpi;
  revenue_by_day: { date: string; revenue: number; orders: number }[];
  top_customers: { name: string; revenue: number; orders: number }[];
  top_items: { name: string; revenue: number; weight_kg: number }[];
  order_statuses: { status: string; count: number }[];
  churn_risk: { name: string; curr: number; prev: number; pct: number }[];
  recent_orders: { doc_number: string; doc_date: string; customer_name: string; amount: number; weight_kg: number; status: string }[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEFAULT_BLOCKS: BlockId[] = [
  "revenue_trend", "top_customers", "top_items", "status_pie", "churn_risk", "recent_orders",
];

const BLOCK_TITLES: Record<BlockId, string> = {
  revenue_trend: "Динамика выручки",
  top_customers: "Топ клиентов",
  top_items: "Топ товаров",
  status_pie: "Статусы заказов",
  churn_risk: "Риск оттока",
  recent_orders: "Последние заказы",
};

const CHART_COLORS = ["#10b981", "#818cf8", "#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#34d399", "#f97316"];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#60a5fa",
  shipped: "#fbbf24",
  closed: "#10b981",
  cancelled: "#fb7185",
  draft: "#9f9fa9",
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: "Подтверждён",
  shipped: "Отгружен",
  closed: "Закрыт",
  cancelled: "Отменён",
  draft: "Черновик",
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmtNum = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const fmtKg = (n: number) => `${fmtNum(n)} кг`;

function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-zinc-100 flex items-center gap-1"><Minus className="w-3 h-3" />0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs flex items-center gap-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ─────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────
function KpiCard({ label, value, sub, prev, curr, accent }: {
  label: string; value: string; sub?: string;
  prev?: number; curr?: number; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-1">
      <div className="text-xs text-zinc-100 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? "text-zinc-100"}`}>{value}</div>
      <div className="flex items-center justify-between mt-1">
        {sub && <span className="text-xs text-zinc-100">{sub}</span>}
        {curr !== undefined && prev !== undefined && <Delta curr={curr} prev={prev} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tooltip style for dark theme
// ─────────────────────────────────────────────
const ttStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#d4d4d8" },
  itemStyle: { color: "#a1a1aa" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

// ─────────────────────────────────────────────
// Charts & Tables
// ─────────────────────────────────────────────
function RevenueTrendChart({ data }: { data: Stats["revenue_by_day"] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} />
        <YAxis tickFormatter={fmtNum} tick={{ fill: "#71717a", fontSize: 11 }} width={70} tickLine={false} axisLine={false} />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [fmtNum(Number(v ?? 0)), "Выручка"]} />
        <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopCustomersChart({ data }: { data: Stats["top_customers"] }) {
  if (!data.length) return <Empty />;
  const items = [...data].reverse();
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, items.length * 36)}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtNum} tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          type="category" dataKey="name" width={130}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
          tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}
        />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [fmtNum(Number(v ?? 0)), "Выручка"]} />
        <Bar dataKey="revenue" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopItemsChart({ data }: { data: Stats["top_items"] }) {
  if (!data.length) return <Empty />;
  const items = [...data].reverse();
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, items.length * 36)}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtKg} tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          type="category" dataKey="name" width={130}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
          tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}
        />
        <Tooltip {...ttStyle} formatter={(v: unknown) => [fmtKg(Number(v ?? 0)), "Вес (нетто)"]} />
        <Bar dataKey="weight_kg" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatusPieChart({ data }: { data: Stats["order_statuses"] }) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);
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
              return [`${num} (${((num / total) * 100).toFixed(1)}%)`, STATUS_LABELS[key] ?? key];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.status] ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-zinc-300">{STATUS_LABELS[d.status] ?? d.status}</span>
            <span className="ml-auto font-mono text-zinc-400">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChurnRiskTable({ data }: { data: Stats["churn_risk"] }) {
  if (!data.length)
    return <p className="text-sm text-zinc-100 py-4">Клиентов с риском оттока нет — всё стабильно.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-100 text-xs border-b border-zinc-800">
            <th className="pb-2 font-medium">Клиент</th>
            <th className="pb-2 font-medium text-right">Пред. период</th>
            <th className="pb-2 font-medium text-right">Текущий период</th>
            <th className="pb-2 font-medium text-right">Изменение</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
              <td className="py-2.5 pr-4 font-medium text-zinc-200">{r.name}</td>
              <td className="py-2.5 pr-4 text-right text-zinc-400 font-mono">{fmtNum(r.prev)}</td>
              <td className="py-2.5 pr-4 text-right text-zinc-300 font-mono">{fmtNum(r.curr)}</td>
              <td className="py-2.5 text-right font-mono text-red-400">
                {r.pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentOrdersTable({ data }: { data: Stats["recent_orders"] }) {
  if (!data.length) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-center text-zinc-100 text-xs border-b border-zinc-800">
            <th className="pb-2 font-medium">Номер</th>
            <th className="pb-2 font-medium">Дата</th>
            <th className="pb-2 font-medium">Клиент</th>
            <th className="pb-2 font-medium">Сумма</th>
            <th className="pb-2 font-medium">Вес (нетто)</th>
            <th className="pb-2 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition text-center">
              <td className="py-2.5 pr-4 font-mono text-zinc-300 text-xs">{r.doc_number}</td>
              <td className="py-2.5 pr-4 text-zinc-400 text-xs whitespace-nowrap">{r.doc_date}</td>
              <td className="py-2.5 pr-4 text-zinc-200">{r.customer_name}</td>
              <td className="py-2.5 pr-4 font-mono text-zinc-300">{fmtNum(r.amount)}</td>
              <td className="py-2.5 pr-4 font-mono text-zinc-400">{fmtKg(r.weight_kg)}</td>
              <td className="py-2.5">
                <span
                  className="inline-flex px-2 py-0.5 rounded-full text-[10px] border text-zinc-100"
                  style={{
                    color: STATUS_COLORS[r.status] ?? "#f4f5f5",
                    borderColor: (STATUS_COLORS[r.status] ?? "#f4f5f5") + "60",
                  }}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-zinc-600 py-6 text-center">Нет данных за выбранный период</p>;
}

// ─────────────────────────────────────────────
// Sortable block wrapper
// ─────────────────────────────────────────────
function BlockContent({ id, stats }: { id: BlockId; stats: Stats | null }) {
  if (!stats) return <div className="h-40 animate-pulse bg-zinc-800/40 rounded-lg" />;
  switch (id) {
    case "revenue_trend": return <RevenueTrendChart data={stats.revenue_by_day} />;
    case "top_customers": return <TopCustomersChart data={stats.top_customers} />;
    case "top_items": return <TopItemsChart data={stats.top_items} />;
    case "status_pie": return <StatusPieChart data={stats.order_statuses} />;
    case "churn_risk": return <ChurnRiskTable data={stats.churn_risk} />;
    case "recent_orders": return <RecentOrdersTable data={stats.recent_orders} />;
  }
}

function SortableBlock({ id, stats, overlay }: { id: BlockId; stats: Stats | null; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col
        ${isDragging && !overlay ? "opacity-40" : ""}
        ${overlay ? "shadow-2xl shadow-black/60" : ""}
      `}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition p-0.5 rounded"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-200">{BLOCK_TITLES[id]}</span>
      </div>
      <div className="p-4">
        <BlockContent id={id} stats={stats} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Filter bar helpers
// ─────────────────────────────────────────────
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border
        ${active
          ? "bg-zinc-700 border-zinc-500 text-zinc-100"
          : "border-zinc-800 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
        }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [saleType, setSaleType] = useState<SaleType>("all");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockId[]>(DEFAULT_BLOCKS);
  const [draggingId, setDraggingId] = useState<BlockId | null>(null);

  // Load block order from localStorage after mount (avoids hydration mismatch)
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
    setLoading(true);
    setFetchErr(null);
    setStats(null);
    fetch(`/api/dashboard/stats?period=${period}&saleType=${saleType}`)
      .then(r => r.json())
      .then((data: Stats & { error?: string }) => {
        if (data.error) { setFetchErr(data.error); }
        else { setStats(data); }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setFetchErr(e instanceof Error ? e.message : "Ошибка загрузки");
        setLoading(false);
      });
  }, [period, saleType]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setDraggingId(active.id as BlockId);
  }

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

  return (
    <div className="p-4 sm:p-6 space-y-5 mx-auto">

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-800 mr-1">Период:</span>
          {(["7d", "30d", "90d", "ytd"] as Period[]).map(p => (
            <FilterChip key={p} label={{ "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", "ytd": "Год" }[p]} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-100 mr-1">Тип:</span>
          {(["all", "domestic", "export"] as SaleType[]).map(s => (
            <FilterChip key={s} label={{ "all": "Все", "domestic": "Местные", "export": "Экспорт" }[s]} active={saleType === s} onClick={() => setSaleType(s)} />
          ))}
          <button
            onClick={fetchStats}
            className="ml-2 p-1.5 rounded-lg border border-zinc-800 text-zinc-800 hover:text-zinc-300 hover:bg-zinc-800 transition"
            title="Обновить"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="font-medium">Ошибка запроса:</span> {fetchErr}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Выручка"
          value={kpi ? fmtNum(kpi.revenue) : "—"}
          curr={kpi?.revenue}
          prev={kpi?.revenue_prev}
          accent="text-emerald-400"
        />
        <KpiCard
          label="Заказов"
          value={kpi ? String(kpi.orders) : "—"}
          curr={kpi?.orders}
          prev={kpi?.orders_prev}
        />
        <KpiCard
          label="Активных клиентов"
          value={kpi ? String(kpi.active_customers) : "—"}
          sub="с заказами за период"
        />
        <KpiCard
          label="Непрочитанных"
          value={kpi ? String(kpi.unread) : "—"}
          sub="сообщений в Inbox"
          accent={kpi && kpi.unread > 0 ? "text-amber-400" : undefined}
        />
      </div>

      {/* Sortable blocks */}
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
