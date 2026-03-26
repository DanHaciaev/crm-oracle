"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#3B82F6", "#22C55E", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  "#06B6D4", "#84CC16", "#A855F7", "#64748B",
];

function getColor(i: number) { return COLORS[i % COLORS.length]; }

interface Sale    { id: number; month: string; revenue: number; expenses: number; }
interface Traffic { id: number; name: string;  value: number; }

const EMPTY_SALE    = { month: "", revenue: "", expenses: "" };
const EMPTY_TRAFFIC = { name: "", value: "" };

type SaleModal    = { mode: "create" } | { mode: "edit"; item: Sale };
type TrafficModal = { mode: "create" } | { mode: "edit"; item: Traffic };

interface Field { key: string; label: string; placeholder: string; type?: string; }

function Modal({ title, fields, form, setForm, onClose, onSubmit, loading }: {
  title: string;
  fields: Field[];
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="space-y-3">
          {fields.map(({ key, label, placeholder, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                type={type ?? "text"}
                className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button onClick={onSubmit} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition">
            {loading ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableRow({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-xs text-gray-600">{children}</span>
      <button onClick={onEdit} className="text-xs text-gray-300 group-hover:text-gray-500 transition ml-2">✏️</button>
    </div>
  );
}

const SALE_FIELDS: Field[] = [
  { key: "month",    label: "Месяц",   placeholder: "Янв" },
  { key: "revenue",  label: "Выручка", placeholder: "5000", type: "number" },
  { key: "expenses", label: "Расходы", placeholder: "3000", type: "number" },
];

const TRAFFIC_FIELDS: Field[] = [
  { key: "name",  label: "Источник", placeholder: "Органика" },
  { key: "value", label: "Значение", placeholder: "400", type: "number" },
];

export default function Charts() {
  const [salesData, setSalesData]       = useState<Sale[]>([]);
  const [pieData, setPieData]           = useState<Traffic[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saleModal, setSaleModal]       = useState<SaleModal | null>(null);
  const [trafficModal, setTrafficModal] = useState<TrafficModal | null>(null);
  const [saleForm, setSaleForm]         = useState<Record<string, string>>(EMPTY_SALE);
  const [trafficForm, setTrafficForm]   = useState<Record<string, string>>(EMPTY_TRAFFIC);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [salesRes, trafficRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/traffic"),
      ]);
      if (!salesRes.ok || !trafficRes.ok) {
        setError("Ошибка загрузки данных");
        setLoading(false);
        return;
      }
      setSalesData(await salesRes.json());
      setPieData(await trafficRes.json());
      setLoading(false);
    }
    fetchData();
  }, []);

  function openCreateSale() { setSaleForm(EMPTY_SALE); setSaleModal({ mode: "create" }); }
  function openEditSale(item: Sale) {
    setSaleForm({ month: item.month, revenue: String(item.revenue), expenses: String(item.expenses) });
    setSaleModal({ mode: "edit", item });
  }

  async function handleSaleSave() {
    setSaving(true);
    const payload = { month: saleForm.month, revenue: Number(saleForm.revenue), expenses: Number(saleForm.expenses) };

    if (saleModal?.mode === "create") {
      const res  = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      setSalesData((prev) => [...prev, data]);
    } else if (saleModal?.mode === "edit") {
      await fetch("/api/sales", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saleModal.item.id, ...payload }) });
      setSalesData((prev) => prev.map((s) => s.id === saleModal.item.id ? { ...s, ...payload } : s));
    }
    setSaving(false);
    setSaleModal(null);
  }

  function openCreateTraffic() { setTrafficForm(EMPTY_TRAFFIC); setTrafficModal({ mode: "create" }); }
  function openEditTraffic(item: Traffic) {
    setTrafficForm({ name: item.name, value: String(item.value) });
    setTrafficModal({ mode: "edit", item });
  }

  async function handleTrafficSave() {
    setSaving(true);
    const payload = { name: trafficForm.name, value: Number(trafficForm.value) };

    if (trafficModal?.mode === "create") {
      const res  = await fetch("/api/traffic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      setPieData((prev) => [...prev, data]);
    } else if (trafficModal?.mode === "edit") {
      await fetch("/api/traffic", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: trafficModal.item.id, ...payload }) });
      setPieData((prev) => prev.map((t) => t.id === trafficModal.item.id ? { ...t, ...payload } : t));
    }
    setSaving(false);
    setTrafficModal(null);
  }

  const salesChartData = salesData.map((s) => ({ month: s.month, "выручка": s.revenue, "расходы": s.expenses }));
  const pieChartData   = pieData.map((t) => ({ name: t.name, value: t.value }));

  if (loading) return <div className="p-6 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="p-6 text-sm text-red-500">Ошибка: {error}</div>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Выручка vs расходы</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="выручка" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="расходы" stroke="#EF4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Продажи по месяцам</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="выручка" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Динамика роста</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="выручка" stroke="#3B82F6" fill="#EFF6FF" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 pb-10 pt-4 px-4">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Источники трафика</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={30} outerRadius={80} dataKey="value">
                {pieChartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">Данные продаж</h3>
            <button onClick={openCreateSale} className="px-3 py-1 text-xs rounded-lg bg-black text-white hover:bg-gray-800 transition">+ Добавить</button>
          </div>
          <div className="space-y-2">
            {salesData.map((s) => (
              <EditableRow key={s.id} onEdit={() => openEditSale(s)}>
                <span className="font-medium w-8 inline-block">{s.month}</span>
                <span className="ml-3 text-blue-600">↑ {s.revenue.toLocaleString()}</span>
                <span className="ml-3 text-red-500">↓ {s.expenses.toLocaleString()}</span>
              </EditableRow>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">Источники трафика</h3>
            <button onClick={openCreateTraffic} className="px-3 py-1 text-xs rounded-lg bg-black text-white hover:bg-gray-800 transition">+ Добавить</button>
          </div>
          <div className="space-y-2">
            {pieData.map((t, i) => (
              <EditableRow key={t.id} onEdit={() => openEditTraffic(t)}>
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getColor(i) }} />
                <span className="font-medium">{t.name}</span>
                <span className="ml-3 text-gray-400">{t.value.toLocaleString()}</span>
              </EditableRow>
            ))}
          </div>
        </div>
      </div>

      {saleModal && (
        <Modal
          title={saleModal.mode === "create" ? "Добавить месяц" : "Редактировать месяц"}
          fields={SALE_FIELDS} form={saleForm} setForm={setSaleForm}
          loading={saving} onClose={() => setSaleModal(null)} onSubmit={handleSaleSave}
        />
      )}

      {trafficModal && (
        <Modal
          title={trafficModal.mode === "create" ? "Добавить источник" : "Редактировать источник"}
          fields={TRAFFIC_FIELDS} form={trafficForm} setForm={setTrafficForm}
          loading={saving} onClose={() => setTrafficModal(null)} onSubmit={handleTrafficSave}
        />
      )}
    </>
  );
}