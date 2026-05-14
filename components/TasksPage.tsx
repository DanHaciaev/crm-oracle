"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Task {
  id: number; title: string;
  customer_id: number | null; customer_name: string | null;
  deal_id: number | null; deal_title: string | null;
  assigned_to: string | null; due_date: string | null;
  priority: string; status: string; notes: string;
  created_at: string | null; completed_at: string | null;
}

interface NewTaskForm {
  title: string; customer_id: string; assigned_to: string;
  due_date: string; priority: string; notes: string;
}

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Срочно",  cls: "border-red-500/50 text-red-400 bg-red-500/10" },
  high:   { label: "Высокий", cls: "border-orange-500/50 text-orange-400 bg-orange-500/10" },
  normal: { label: "Обычный", cls: "border-zinc-600 text-zinc-400 bg-zinc-800/40" },
  low:    { label: "Низкий",  cls: "border-zinc-700 text-zinc-600 bg-transparent" },
};

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open:        { label: "Открыта",      cls: "border-blue-500/40 text-blue-400" },
  in_progress: { label: "В работе",     cls: "border-violet-500/40 text-violet-400" },
  done:        { label: "Выполнена",    cls: "border-emerald-500/40 text-emerald-400" },
  cancelled:   { label: "Отменена",     cls: "border-zinc-700 text-zinc-500" },
};

function fmtDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function isOverdue(s: string | null, status: string) {
  if (!s || status === "done" || status === "cancelled") return false;
  return new Date(s) < new Date();
}

interface Customer { id: number; name: string; }

interface Props { customerId?: number; compact?: boolean; }

export default function TasksPage({ customerId, compact = false }: Props) {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [statusFilter, setStatus] = useState("open,in_progress");
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState<NewTaskForm>({
    title: "", customer_id: customerId ? String(customerId) : "",
    assigned_to: "", due_date: "", priority: "normal", notes: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams();
    if (customerId) p.set("customer_id", String(customerId));
    const res  = await fetch(`/api/tasks${p.size ? "?" + p : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setTasks(data as Task[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (!showForm || customerId || customers.length) return;
    fetch("/api/customers")
      .then(r => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setCustomers(d.map((c: Record<string, unknown>) => ({ id: Number(c.id), name: String(c.name ?? "") })));
      })
      .catch(() => {});
  }, [showForm, customerId, customers.length]);

  async function updateStatus(taskId: number, status: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function deleteTask(id: number) {
    if (!confirm("Удалить задачу?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function createTask() {
    if (!form.title) return;
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:       form.title,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        assigned_to: form.assigned_to || null,
        due_date:    form.due_date || null,
        priority:    form.priority,
        notes:       form.notes || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm(f => ({ ...f, title: "", assigned_to: "", due_date: "", notes: "" }));
      fetchTasks();
    }
  }

  const statusFilters = statusFilter.split(",");
  const filtered = tasks.filter(t =>
    statusFilter === "all" ? true : statusFilters.includes(t.status)
  );

  const counts = { open: 0, in_progress: 0, done: 0, cancelled: 0 };
  tasks.forEach(t => { if (t.status in counts) counts[t.status as keyof typeof counts]++; });

  return (
    <div className={compact ? "" : "p-8"}>
      {!compact && (
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Задачи</h1>
            <p className="text-sm text-zinc-500 mt-1">Задачи менеджеров по клиентам</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition"
          >
            + Новая задача
          </button>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-300">Задачи</span>
          <button onClick={() => setShowForm(true)} className="text-xs px-2.5 py-1 border border-zinc-700 rounded-md hover:bg-zinc-800 transition">
            + Добавить
          </button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1 flex-wrap mb-4">
        {[
          { v: "open,in_progress", label: "Активные", count: counts.open + counts.in_progress },
          { v: "open",             label: "Открытые", count: counts.open },
          { v: "in_progress",      label: "В работе",  count: counts.in_progress },
          { v: "done",             label: "Выполнены", count: counts.done },
          { v: "all",              label: "Все",       count: tasks.length },
        ].map(s => (
          <button key={s.v} onClick={() => setStatus(s.v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition
              ${statusFilter === s.v ? "border-zinc-400 bg-zinc-800/50 text-white" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800/20"}`}>
            {s.label} <span className="tabular-nums">{s.count}</span>
          </button>
        ))}
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {/* Task list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-zinc-500 text-sm py-6 text-center">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-600 text-sm py-6 text-center">Нет задач</div>
        ) : filtered.map((task) => {
          const overdue = isOverdue(task.due_date, task.status);
          const pCfg = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.normal;
          const sCfg = STATUS_CFG[task.status]     ?? STATUS_CFG.open;
          return (
            <div key={task.id}
              className={`border rounded-xl p-4 flex items-start gap-3 group transition
                ${task.status === "done" ? "border-zinc-800/50 opacity-60" : "border-zinc-800 hover:border-zinc-700"}`}>
              {/* Status toggle checkbox */}
              <button
                onClick={() => updateStatus(task.id, task.status === "done" ? "open" : "done")}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition
                  ${task.status === "done" ? "border-emerald-500 bg-emerald-500/20" : "border-zinc-600 hover:border-emerald-500"}`}
              >
                {task.status === "done" && <span className="text-emerald-400 text-xs">✓</span>}
              </button>

              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${task.status === "done" ? "line-through text-zinc-500" : ""}`}>
                  {task.title}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${pCfg.cls}`}>
                    {pCfg.label}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${sCfg.cls}`}>
                    {sCfg.label}
                  </span>
                  {task.due_date && (
                    <span className={`text-xs ${overdue ? "text-red-400" : "text-zinc-500"}`}>
                      {overdue ? "⚠ " : ""}до {fmtDate(task.due_date)}
                    </span>
                  )}
                  {task.customer_name && !customerId && (
                    <Link href={`/customers/${task.customer_id}`}
                      className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 decoration-zinc-700 transition">
                      {task.customer_name}
                    </Link>
                  )}
                  {task.assigned_to && (
                    <span className="text-xs text-zinc-600">👤 {task.assigned_to}</span>
                  )}
                </div>
                {task.notes && (
                  <div className="text-xs text-zinc-600 mt-1.5 line-clamp-1">{task.notes}</div>
                )}
              </div>

              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                {task.status === "open" && (
                  <button onClick={() => updateStatus(task.id, "in_progress")}
                    className="text-xs px-2 py-1 border border-zinc-700 rounded-md hover:bg-zinc-800 transition">
                    В работу
                  </button>
                )}
                <button onClick={() => deleteTask(task.id)}
                  className="text-xs px-2 py-1 border border-red-800/50 text-red-500 rounded-md hover:bg-red-950/30 transition">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New task modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Новая задача</h2>
            <div className="space-y-3 text-sm">
              <TInput label="Название *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
              {!customerId && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Клиент</label>
                  <select
                    value={form.customer_id}
                    onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="">Без клиента</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Приоритет</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400">
                    <option value="low">Низкий</option>
                    <option value="normal">Обычный</option>
                    <option value="high">Высокий</option>
                    <option value="urgent">Срочно</option>
                  </select>
                </div>
                <TInput label="Срок" value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} type="date" />
              </div>
              <TInput label="Ответственный" value={form.assigned_to} onChange={v => setForm(f => ({ ...f, assigned_to: v }))} />
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Заметки</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 transition">Отмена</button>
              <button onClick={createTask} disabled={saving || !form.title}
                className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-40 transition">
                {saving ? "Сохраняем..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TInput({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition" />
    </div>
  );
}
