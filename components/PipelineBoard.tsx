/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Deal {
  id: number; title: string; customer_id: number; customer_name: string;
  stage: string; amount: number | null; currency: string; probability: number;
  expected_date: string | null; assigned_to: string | null; notes: string;
  created_at: string | null; updated_at: string | null; closed_at: string | null;
}

interface NewDealForm {
  title: string; customer_id: string; amount: string;
  probability: string; expected_date: string; assigned_to: string; notes: string;
}

const STAGES: { id: string; label: string; color: string; probDefault: number }[] = [
  { id: "lead",        label: "Лид",          color: "border-zinc-600",       probDefault: 10  },
  { id: "qualified",   label: "Квалифицирован", color: "border-blue-600",     probDefault: 25  },
  { id: "proposal",   label: "Предложение",   color: "border-violet-600",     probDefault: 50  },
  { id: "negotiation", label: "Переговоры",   color: "border-amber-600",      probDefault: 75  },
  { id: "won",         label: "Выиграно",     color: "border-emerald-600",    probDefault: 100 },
  { id: "lost",        label: "Проиграно",    color: "border-red-600",        probDefault: 0   },
];

const STAGE_HEADER: Record<string, string> = {
  lead:        "bg-zinc-800/60",
  qualified:   "bg-blue-900/30",
  proposal:    "bg-violet-900/30",
  negotiation: "bg-amber-900/30",
  won:         "bg-emerald-900/30",
  lost:        "bg-red-900/30",
};

function fmtMoney(n: number | null) {
  if (n === null || n === 0) return null;
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

interface Customer { id: number; name: string; }

export default function PipelineBoard() {
  const [deals, setDeals]           = useState<Deal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [dragging, setDragging]     = useState<number | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState<NewDealForm>({
    title: "", customer_id: "", amount: "", probability: "10",
    expected_date: "", assigned_to: "", notes: "",
  });

  const fetchDeals = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/deals");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setDeals(data as Deal[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  useEffect(() => {
    if (!showForm || customers.length) return;
    fetch("/api/customers")
      .then(r => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setCustomers(d.map((c: Record<string, unknown>) => ({ id: Number(c.id), name: String(c.name ?? "") })));
      })
      .catch(() => {});
  }, [showForm, customers.length]);

  async function moveStage(dealId: number, stage: string) {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage } : d));
    await fetch(`/api/deals/${dealId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
  }

  async function createDeal() {
    if (!form.title || !form.customer_id) return;
    setSaving(true);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:         form.title,
        customer_id:   Number(form.customer_id),
        amount:        form.amount ? Number(form.amount) : null,
        probability:   Number(form.probability),
        expected_date: form.expected_date || null,
        assigned_to:   form.assigned_to || null,
        notes:         form.notes || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm({ title: "", customer_id: "", amount: "", probability: "10", expected_date: "", assigned_to: "", notes: "" });
      fetchDeals();
    }
  }

  async function deleteDeal(id: number) {
    if (!confirm("Удалить сделку?")) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    setDeals(prev => prev.filter(d => d.id !== id));
  }

  const byStage = (stage: string) => deals.filter(d => d.stage === stage);
  const totalPipeline = deals
    .filter(d => !["won","lost"].includes(d.stage) && d.amount)
    .reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {deals.filter(d => !["won","lost"].includes(d.stage)).length} активных сделок
            {totalPipeline > 0 && ` · ${totalPipeline.toLocaleString("ru-RU")} MDL в воронке`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition"
        >
          + Новая сделка
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Board */}
      {loading ? (
        <div className="text-zinc-500 text-sm">Загрузка...</div>
      ) : (
        <div className="flex gap-3 min-w-0 pb-4 w-full">
          {STAGES.map((stage) => {
            const col = byStage(stage.id);
            const colAmount = col.reduce((s, d) => s + (d.amount ?? 0), 0);
            return (
              <div
                key={stage.id}
                className={`flex-1 min-w-0 rounded-xl border ${stage.color} flex flex-col`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null) moveStage(dragging, stage.id);
                  setDragging(null);
                }}
              >
                {/* Column header */}
                <div className={`px-3 py-2.5 rounded-t-xl ${STAGE_HEADER[stage.id]} border-b ${stage.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{stage.label}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">{col.length}</span>
                  </div>
                  {colAmount > 0 && (
                    <div className="text-xs text-zinc-400 mt-0.5 tabular-nums">{colAmount.toLocaleString("ru-RU")} MDL</div>
                  )}
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 min-h-30">
                  {col.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => setDragging(deal.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition group ${dragging === deal.id ? "opacity-40" : ""}`}
                    >
                      <div className="text-sm font-medium leading-snug mb-1">{deal.title}</div>
                      <Link
                        href={`/customers/${deal.customer_id}`}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deal.customer_name}
                      </Link>
                      <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
                        {fmtMoney(deal.amount) && (
                          <span className="text-xs font-mono text-zinc-300">{fmtMoney(deal.amount)} {deal.currency}</span>
                        )}
                        <span className="text-xs text-zinc-600">{deal.probability}%</span>
                      </div>
                      {deal.expected_date && (
                        <div className="text-xs text-zinc-600 mt-1">{fmtDate(deal.expected_date)}</div>
                      )}
                      {deal.assigned_to && (
                        <div className="text-xs text-zinc-600 mt-0.5">👤 {deal.assigned_to}</div>
                      )}
                      <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => deleteDeal(deal.id)}
                          className="text-xs text-red-500 hover:text-red-400 px-1.5 py-0.5 rounded"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New deal modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Новая сделка</h2>

            <div className="space-y-3 text-sm">
              <Input label="Название *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Клиент *</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}
                  className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400"
                >
                  <option value="">Выберите клиента</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Сумма (MDL)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" />
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Вероятность %</label>
                  <select
                    value={form.probability}
                    onChange={(e) => setForm(f => ({ ...f, probability: e.target.value }))}
                    className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    {[10,25,50,75,90,100].map(p => <option key={p} value={p}>{p}%</option>)}
                  </select>
                </div>
              </div>

              <Input label="Ожидаемая дата" value={form.expected_date} onChange={v => setForm(f => ({ ...f, expected_date: v }))} type="date" />
              <Input label="Ответственный" value={form.assigned_to} onChange={v => setForm(f => ({ ...f, assigned_to: v }))} />
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Заметки</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 transition">
                Отмена
              </button>
              <button
                onClick={createDeal}
                disabled={saving || !form.title || !form.customer_id}
                className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-40 transition"
              >
                {saving ? "Сохраняем..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition"
      />
    </div>
  );
}
