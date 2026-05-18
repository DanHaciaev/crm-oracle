"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Lead {
  id: number; name: string; company: string | null;
  phone: string | null; email: string | null;
  source: string; status: string; notes: string | null;
  assigned_to: string | null; customer_id: number | null;
  created_by: string | null; created_at: string | null; updated_at: string | null;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  new:       { label: "Новый",       cls: "border-sky-500/50   text-sky-400   bg-sky-500/10"   },
  contacted: { label: "Контакт",     cls: "border-blue-500/50  text-blue-400  bg-blue-500/10"  },
  qualified: { label: "Квалифицирован", cls: "border-violet-500/50 text-violet-400 bg-violet-500/10" },
  proposal:  { label: "Предложение", cls: "border-amber-500/50 text-amber-400 bg-amber-500/10" },
  won:       { label: "Выигран",     cls: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" },
  lost:      { label: "Проигран",    cls: "border-red-500/50   text-red-400   bg-red-500/10"   },
};

const SOURCE_LABELS: Record<string, string> = {
  web: "Сайт", referral: "Рекомендация", cold_call: "Холодный звонок",
  social: "Соцсети", exhibition: "Выставка", other: "Другое",
};

const STATUS_ORDER = ["new","contacted","qualified","proposal","won","lost"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: "border-zinc-700 text-zinc-400" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const BLANK: Partial<Lead> = {
  name: "", company: "", phone: "", email: "",
  source: "other", status: "new", notes: "", assigned_to: "",
};

export default function LeadsPage() {
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [status, setStatus]   = useState("all");
  const [search, setSearch]   = useState("");
  const [modal, setModal]     = useState<"create" | { lead: Lead } | null>(null);
  const [form, setForm]       = useState<Partial<Lead>>(BLANK);
  const [saving, setSaving]   = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/leads");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setLeads(data as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length };
    leads.forEach(l => { m[l.status] = (m[l.status] ?? 0) + 1; });
    return m;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(l => {
      const matchStatus = status === "all" || l.status === status;
      const matchSearch = !q
        || l.name.toLowerCase().includes(q)
        || (l.company ?? "").toLowerCase().includes(q)
        || (l.phone   ?? "").toLowerCase().includes(q)
        || (l.email   ?? "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [leads, status, search]);

  function openCreate() {
    setForm({ ...BLANK });
    setModal("create");
  }

  function openEdit(lead: Lead) {
    setForm({ ...lead });
    setModal({ lead });
  }

  async function handleSave() {
    setSaving(true);
    const isEdit = modal !== "create" && modal !== null;
    const url    = isEdit ? `/api/leads/${(modal as { lead: Lead }).lead.id}` : "/api/leads";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);
    if (res.ok) {
      setModal(null);
      fetchData();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить лид?")) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchData();
  }

  function set(k: keyof Lead, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Лиды</h1>
          <p className="text-sm text-zinc-500 mt-1">Потенциальные клиенты до первой покупки</p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg transition">
          + Новый лид
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[{ v: "all", label: "Все" }, ...STATUS_ORDER.map(s => ({ v: s, label: STATUS_CFG[s].label }))].map(s => (
          <button key={s.v} onClick={() => setStatus(s.v)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition ${
              status === s.v
                ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}>
            {s.label}
            <span className="ml-1.5 text-zinc-500">{counts[s.v] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text" placeholder="Поиск по имени, компании..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-400 transition w-64"
        />
        {(search || status !== "all") && (
          <button onClick={() => { setSearch(""); setStatus("all"); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            Сбросить
          </button>
        )}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>КОНТАКТ</TableHead>
              <TableHead>СТАТУС</TableHead>
              <TableHead>ИСТОЧНИК</TableHead>
              <TableHead>ОТВЕТСТВЕННЫЙ</TableHead>
              <TableHead>ДАТА</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-zinc-500 py-8">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={6} className="text-center text-red-400 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-zinc-600 py-8">Лидов не найдено</TableCell></TableRow>
            ) : filtered.map(l => (
              <TableRow key={l.id} className="hover:bg-zinc-100 transition-colors cursor-pointer"
                onClick={() => openEdit(l)}>
                <TableCell>
                  <div className="font-medium text-zinc-200">{l.name}</div>
                  {l.company && <div className="text-xs text-zinc-500">{l.company}</div>}
                  {l.phone   && <div className="text-xs text-zinc-600 font-mono">{l.phone}</div>}
                  {l.email   && <div className="text-xs text-zinc-600">{l.email}</div>}
                </TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {SOURCE_LABELS[l.source] ?? l.source}
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {l.assigned_to ?? <span className="text-zinc-700">—</span>}
                </TableCell>
                <TableCell className="text-xs text-zinc-500">{fmtDate(l.created_at)}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleDelete(l.id)}
                    className="text-zinc-600 hover:text-red-400 transition text-sm px-2">✕</button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-right text-xs text-zinc-500">
          Показано: {filtered.length} из {leads.length}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {modal === "create" ? "Новый лид" : "Редактировать лид"}
              </h2>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-zinc-300 transition text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label="Имя *" value={form.name ?? ""} onChange={v => set("name", v)} />
              <Field label="Компания" value={form.company ?? ""} onChange={v => set("company", v)} />
              <Field label="Телефон" value={form.phone ?? ""} onChange={v => set("phone", v)} />
              <Field label="Email" value={form.email ?? ""} onChange={v => set("email", v)} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Источник</label>
                  <select value={form.source ?? "other"} onChange={e => set("source", e.target.value)}
                    className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-400">
                    {Object.entries(SOURCE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Статус</label>
                  <select value={form.status ?? "new"} onChange={e => set("status", e.target.value)}
                    className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-400">
                    {STATUS_ORDER.map(s => (
                      <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Field label="Ответственный" value={form.assigned_to ?? ""} onChange={v => set("assigned_to", v)} />
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Заметки</label>
                <textarea
                  rows={3}
                  value={form.notes ?? ""}
                  onChange={e => set("notes", e.target.value)}
                  className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-400 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition">
                Отмена
              </button>
              <button onClick={handleSave} disabled={saving || !form.name?.trim()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm rounded-lg transition">
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-400 transition"
      />
    </div>
  );
}
