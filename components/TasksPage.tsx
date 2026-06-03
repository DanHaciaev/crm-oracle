/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/locale";

interface Task {
  id: number; title: string;
  customer_id: number | null; customer_name: string | null;
  assigned_to: string | null; due_date: string | null;
  priority: string; status: string; notes: string;
  created_at: string | null; completed_at: string | null;
}

interface NewTaskForm {
  title: string; customer_id: string; assigned_to: string;
  due_date: string; priority: string; notes: string;
}

const PRIORITY_CLS: Record<string, string> = {
  urgent: "border-red-500/50 text-red-400 bg-red-500/10",
  high:   "border-orange-500/50 text-orange-400 bg-orange-500/10",
  normal: "border-gray-800 text-gray-400 bg-gray-100",
  low:    "border-gray-800 text-gray-400 bg-transparent",
};

const STATUS_CLS: Record<string, string> = {
  open:        "border-blue-500/40 text-blue-400",
  in_progress: "border-violet-500/40 text-violet-400",
  done:        "border-emerald-500/40 text-emerald-400",
  cancelled:   "border-gray-800 text-gray-400",
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
  const t = useT();
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [statusFilter, setStatus] = useState("open,in_progress");
  const [showForm, setShowForm]   = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<NewTaskForm>({
    title: "", customer_id: customerId ? String(customerId) : "",
    assigned_to: "", due_date: "", priority: "normal", notes: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams();
    if (customerId) p.set("customer_id", String(customerId));
    const res  = await fetch(`/api/tasks${p.size ? "?" + p : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setTasks(data as Task[]);
    setLoading(false);
  }, [customerId, t]);

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
    setTasks(prev => prev.map(tk => tk.id === taskId ? { ...tk, status } : tk));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function deleteTask(id: number) {
    if (!confirm(t("tasks.noTasks"))) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(tk => tk.id !== id));
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
  const filtered = tasks.filter(tk =>
    statusFilter === "all" ? true : statusFilters.includes(tk.status)
  );

  const counts = { open: 0, in_progress: 0, done: 0, cancelled: 0 };
  tasks.forEach(tk => { if (tk.status in counts) counts[tk.status as keyof typeof counts]++; });

  return (
    <div className={compact ? "" : "p-4 sm:p-8"}>
      {!compact && (
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{t("tasks.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("tasks.subtitle")}</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg border border-gray-800 text-gray-700 text-sm font-medium hover:bg-gray-100 transition">
            + {t("tasks.newTask")}
          </button>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">{t("tasks.title")}</span>
          <button onClick={() => setShowForm(true)} className="text-sm px-2.5 py-1 border border-gray-800 rounded-md hover:bg-gray-100 transition text-gray-700">
            + {t("common.add")}
          </button>
        </div>
      )}

      <div className="flex gap-1 flex-wrap mb-4">
        {[
          { v: "open,in_progress", label: t("taskStatuses.open") + " + " + t("taskStatuses.in_progress"), count: counts.open + counts.in_progress },
          { v: "open",             label: t("taskStatuses.open"),        count: counts.open },
          { v: "in_progress",      label: t("taskStatuses.in_progress"), count: counts.in_progress },
          { v: "done",             label: t("taskStatuses.done"),        count: counts.done },
          { v: "all",              label: t("common.all"),               count: tasks.length },
        ].map(s => (
          <button key={s.v} onClick={() => setStatus(s.v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm transition
              ${statusFilter === s.v ? "border-gray-800 bg-gray-900 text-white" : "border-gray-800 text-gray-500 hover:bg-gray-100"}`}>
            {s.label} <span className="tabular-nums">{s.count}</span>
          </button>
        ))}
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      <div className="space-y-2">
        {loading ? (
          <div className="text-gray-400 text-sm py-6 text-center">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 text-sm py-6 text-center">{t("tasks.noTasks")}</div>
        ) : filtered.map((task) => {
          const overdue = isOverdue(task.due_date, task.status);
          const pCls = PRIORITY_CLS[task.priority] ?? PRIORITY_CLS.normal;
          const sCls = STATUS_CLS[task.status]     ?? STATUS_CLS.open;
          return (
            <div key={task.id}
              className={`border rounded-xl p-4 flex items-start gap-3 group transition
                ${task.status === "done" ? "border-gray-800 opacity-60" : "border-gray-800 hover:border-gray-800"}`}>
              <button
                onClick={() => updateStatus(task.id, task.status === "done" ? "open" : "done")}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition
                  ${task.status === "done" ? "border-emerald-500 bg-emerald-500/20" : "border-gray-800 hover:border-emerald-500"}`}>
                {task.status === "done" && <span className="text-emerald-400 text-sm">✓</span>}
              </button>

              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-400" : ""}`}>
                  {task.title}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm border ${pCls}`}>
                    {t(`priorities.${task.priority}`) || task.priority}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm border ${sCls}`}>
                    {t(`taskStatuses.${task.status}`) || task.status}
                  </span>
                  {task.due_date && (
                    <span className={`text-sm ${overdue ? "text-red-400" : "text-gray-400"}`}>
                      {overdue ? "⚠ " : ""}до {fmtDate(task.due_date)}
                    </span>
                  )}
                  {task.customer_name && !customerId && (
                    <Link href={`/customers/${task.customer_id}`}
                      className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2 decoration-gray-300 transition">
                      {task.customer_name}
                    </Link>
                  )}
                  {task.assigned_to && (
                    <span className="text-sm text-gray-400">👤 {task.assigned_to}</span>
                  )}
                </div>
                {task.notes && (
                  <div className="text-sm text-gray-400 mt-1.5 line-clamp-1">{task.notes}</div>
                )}
              </div>

              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                {task.status === "open" && (
                  <button onClick={() => updateStatus(task.id, "in_progress")}
                    className="text-sm px-2 py-1 border border-gray-800 rounded-md hover:bg-gray-100 transition text-gray-700">
                    {t("taskStatuses.in_progress")}
                  </button>
                )}
                <button onClick={() => deleteTask(task.id)}
                  className="text-sm px-2 py-1 border border-red-800/50 text-red-500 rounded-md hover:bg-red-950/30 transition">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("tasks.newTask")}</h2>
            <div className="space-y-3 text-sm">
              <TInput label={`${t("tasks.taskTitle")} *`} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
              {!customerId && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">{t("tasks.customer")}</label>
                  <select value={form.customer_id} onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800">
                    <option value="">—</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">{t("tasks.priority")}</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800">
                    <option value="low">{t("priorities.low")}</option>
                    <option value="normal">{t("priorities.normal")}</option>
                    <option value="high">{t("priorities.high")}</option>
                    <option value="urgent">{t("priorities.urgent")}</option>
                  </select>
                </div>
                <TInput label={t("tasks.dueDate")} value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} type="date" />
              </div>
              <TInput label={t("tasks.assignedTo")} value={form.assigned_to} onChange={v => setForm(f => ({ ...f, assigned_to: v }))} />
              <div>
                <label className="block text-sm text-gray-500 mb-1">{t("common.notes")}</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-800 rounded-lg hover:bg-gray-100 transition text-gray-700">
                {t("common.cancel")}
              </button>
              <button onClick={createTask} disabled={saving || !form.title}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition">
                {saving ? t("common.saving") : t("common.create")}
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
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800 transition" />
    </div>
  );
}
