/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from "@dnd-kit/core";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface Lead {
  id: number; name: string; company: string | null;
  phone: string | null; email: string | null;
  source: string; status: string; notes: string | null;
  assigned_to: string | null; customer_id: number | null;
  created_by: string | null; created_at: string | null; updated_at: string | null;
}

const STATUS_ORDER = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const SOURCE_ORDER = ["web", "referral", "cold_call", "social", "exhibition", "other"];

const STATUS_CLS: Record<string, string> = {
  new:       "border-sky-500/50    text-sky-500    bg-sky-50",
  contacted: "border-blue-500/50   text-blue-500   bg-blue-50",
  qualified: "border-violet-500/50 text-violet-500 bg-violet-50",
  proposal:  "border-amber-500/50  text-amber-500  bg-amber-50",
  won:       "border-emerald-500/50 text-emerald-600 bg-emerald-50",
  lost:      "border-red-500/50    text-red-500    bg-red-50",
};

const COLUMN_STYLE: Record<string, { area: string; ring: string }> = {
  new:       { area: "bg-sky-50/60",     ring: "ring-sky-300" },
  contacted: { area: "bg-blue-50/60",    ring: "ring-blue-300" },
  qualified: { area: "bg-violet-50/60",  ring: "ring-violet-300" },
  proposal:  { area: "bg-amber-50/60",   ring: "ring-amber-300" },
  won:       { area: "bg-emerald-50/60", ring: "ring-emerald-300" },
  lost:      { area: "bg-red-50/60",     ring: "ring-red-300" },
};

function fmtDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const BLANK: Partial<Lead> = {
  name: "", company: "", phone: "", email: "",
  source: "other", status: "new", notes: "", assigned_to: "",
};

// ─── Card content (shared between draggable card and drag overlay) ────────────

function TgBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-600 border border-sky-200 shrink-0">
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.035 9.593c-.15.676-.546.84-1.107.522l-3.07-2.262-1.482 1.426c-.163.163-.3.3-.617.3l.22-3.118 5.674-5.126c.247-.22-.054-.342-.383-.122L7.26 14.748l-3.025-.944c-.657-.205-.67-.657.137-.972l11.804-4.553c.548-.198 1.027.134.386.969z"/>
      </svg>
      TG
    </span>
  );
}

function CardContent({ lead, onEdit, onDelete, dragging = false }: {
  lead: Lead; onEdit: (l: Lead) => void;
  onDelete: (id: number) => void; dragging?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-xl p-3 transition-all select-none
      ${dragging
        ? "border-gray-300 shadow-2xl rotate-1 scale-105"
        : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.source === "telegram" && <TgBadge />}
          <button
            className="font-medium text-gray-900 text-sm text-left hover:text-blue-600 transition leading-snug truncate"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onEdit(lead)}
          >
            {lead.name}
          </button>
        </div>
        {!dragging && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onDelete(lead.id)}
            className="text-gray-300 hover:text-red-400 transition shrink-0 text-base leading-none mt-0.5"
          >✕</button>
        )}
      </div>
      {lead.company && (
        <div className="text-xs text-gray-500 mb-1 truncate">{lead.company}</div>
      )}
      {lead.phone && (
        <div className="text-xs text-gray-400 font-mono">{lead.phone}</div>
      )}
      {lead.assigned_to && (
        <div className="mt-2 text-xs text-gray-400 truncate">→ {lead.assigned_to}</div>
      )}
      {lead.created_at && (
        <div className="mt-1.5 text-xs text-gray-300">{fmtDate(lead.created_at)}</div>
      )}
    </div>
  );
}

// ─── Draggable card ───────────────────────────────────────────────────────────

function DraggableCard({ lead, onEdit, onDelete }: {
  lead: Lead; onEdit: (l: Lead) => void; onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-25" : ""}`}
    >
      <CardContent lead={lead} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({ status, leads, onEdit, onDelete, onAdd, t }: {
  status: string; leads: Lead[];
  onEdit: (l: Lead) => void; onDelete: (id: number) => void;
  onAdd: (status: string) => void; t: (k: string) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const col = COLUMN_STYLE[status] ?? { area: "bg-gray-50", ring: "ring-gray-300" };

  return (
    <div className="flex flex-col min-w-52.5 w-52.5 shrink-0">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_CLS[status] ?? ""}`}>
            {t(`leadStatuses.${status}`) || status}
          </span>
          <span className="text-xs text-gray-400 font-mono">{leads.length}</span>
        </div>
        <button
          onClick={() => onAdd(status)}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition"
          title={t("leads.newLead")}
        >+</button>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-25 rounded-xl p-2 space-y-2 transition-all duration-150
          ${col.area} ${isOver ? `ring-2 ${col.ring}` : ""}`}
      >
        {leads.map(lead => (
          <DraggableCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────

function KanbanBoard({ leads, onEdit, onDelete, onAdd, onStatusChange, t }: {
  leads: Lead[]; onEdit: (l: Lead) => void; onDelete: (id: number) => void;
  onAdd: (status: string) => void;
  onStatusChange: (id: number, newStatus: string) => void;
  t: (k: string) => string;
}) {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const byStatus = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    STATUS_ORDER.forEach(s => { m[s] = []; });
    leads.forEach(l => { (m[l.status] ??= []).push(l); });
    return m;
  }, [leads]);

  function handleDragStart({ active }: DragStartEvent) {
    setActiveLead((active.data.current as { lead: Lead }).lead);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveLead(null);
    if (!over || !activeLead) return;
    const newStatus = String(over.id);
    if (STATUS_ORDER.includes(newStatus) && newStatus !== activeLead.status) {
      onStatusChange(Number(active.id), newStatus);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 pt-1 -mx-1 px-1">
        {STATUS_ORDER.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            leads={byStatus[status] ?? []}
            onEdit={onEdit}
            onDelete={onDelete}
            onAdd={onAdd}
            t={t}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeLead && (
          <CardContent lead={activeLead} onEdit={() => {}} onDelete={() => {}} dragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const t = useT();
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [status, setStatus]   = useState("all");
  const [search, setSearch]   = useState("");
  const [view, setView]       = useState<"table" | "kanban">("table");
  const [modal, setModal]     = useState<"create" | { lead: Lead } | null>(null);
  const [form, setForm]       = useState<Partial<Lead>>(BLANK);
  const [saving, setSaving]   = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/leads");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setLeads(data as Lead[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length };
    leads.forEach(l => { m[l.status] = (m[l.status] ?? 0) + 1; });
    return m;
  }, [leads]);

  // Table: filter by status tab + search
  const tableFiltered = useMemo(() => {
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

  // Kanban: filter only by search (columns represent status)
  const kanbanFiltered = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.company ?? "").toLowerCase().includes(q) ||
      (l.phone   ?? "").toLowerCase().includes(q)
    );
  }, [leads, search]);

  function openCreate(defaultStatus = "new") {
    setForm({ ...BLANK, status: defaultStatus });
    setModal("create");
  }
  function openEdit(lead: Lead) { setForm({ ...lead }); setModal({ lead }); }

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
    if (res.ok) { setModal(null); fetchData(); }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("leads.deleteConfirm"))) return;
    setLeads(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  async function handleStatusChange(leadId: number, newStatus: string) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  function set(k: keyof Lead, v: string) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("leads.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-300 rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1.5 transition ${view === "table" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              ☰ {t("leads.viewTable") || "Таблица"}
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 transition border-l border-gray-300 ${view === "kanban" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              ▦ {t("leads.viewKanban") || "Канбан"}
            </button>
          </div>
          <button
            onClick={() => openCreate()}
            className="px-4 py-2 border border-gray-800 text-gray-700 text-sm rounded-lg hover:bg-gray-100 transition"
          >
            + {t("leads.newLead")}
          </button>
        </div>
      </div>

      {/* Search (always visible) */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder={t("leads.searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition w-64"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-sm text-gray-400 hover:text-gray-700 transition">
            {t("common.reset")}
          </button>
        )}
      </div>

      {/* Status filter tabs (table only) */}
      {view === "table" && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[{ v: "all", label: t("common.all") }, ...STATUS_ORDER.map(s => ({ v: s, label: t(`leadStatuses.${s}`) }))].map(s => (
            <button
              key={s.v}
              onClick={() => setStatus(s.v)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                status === s.v
                  ? "border-gray-800 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {s.label}
              <span className="ml-1.5 opacity-60">{counts[s.v] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading / Error */}
      {loading && <div className="text-center text-gray-400 py-16">{t("common.loading")}</div>}
      {error   && <div className="text-center text-red-500 py-8">{error}</div>}

      {/* Kanban view */}
      {!loading && !error && view === "kanban" && (
        <KanbanBoard
          leads={kanbanFiltered}
          onEdit={openEdit}
          onDelete={handleDelete}
          onAdd={openCreate}
          onStatusChange={handleStatusChange}
          t={t}
        />
      )}

      {/* Table view */}
      {!loading && !error && view === "table" && (
        <>
          <div className="border border-gray-800 rounded-xl overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("leads.cols.contact")}</TableHead>
                  <TableHead>{t("leads.cols.status")}</TableHead>
                  <TableHead>{t("leads.cols.source")}</TableHead>
                  <TableHead>{t("leads.cols.assigned")}</TableHead>
                  <TableHead>{t("leads.cols.date")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                      {t("leads.noLeads")}
                    </TableCell>
                  </TableRow>
                ) : tableFiltered.map(l => (
                  <TableRow key={l.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(l)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {l.source === "telegram" && <TgBadge />}
                        <span className="font-medium text-gray-900">{l.name}</span>
                      </div>
                      {l.company && <div className="text-sm text-gray-500">{l.company}</div>}
                      {l.phone   && <div className="text-sm text-gray-500 font-mono">{l.phone}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_CLS[l.status] ?? "border-gray-300 text-gray-500"}`}>
                        {t(`leadStatuses.${l.status}`) || l.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{t(`leadSources.${l.source}`) || l.source}</TableCell>
                    <TableCell className="text-sm text-gray-500">{l.assigned_to ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">{fmtDate(l.created_at)}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(l.id)} className="text-gray-300 hover:text-red-400 transition px-2">✕</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {tableFiltered.length > 0 && (
            <p className="mt-3 text-center text-sm text-gray-400">
              {t("common.showing")}: {tableFiltered.length} {t("common.of")} {leads.length}
            </p>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {modal === "create" ? t("leads.newLead") : t("common.edit")}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-xl transition">×</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label={`${t("common.name")} *`} value={form.name ?? ""} onChange={v => set("name", v)} />
              <Field label={t("common.company")} value={form.company ?? ""} onChange={v => set("company", v)} />
              <Field label={t("common.phone")}   value={form.phone   ?? ""} onChange={v => set("phone",   v)} />
              <Field label={t("common.email")}   value={form.email   ?? ""} onChange={v => set("email",   v)} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 block mb-1">{t("common.source")}</label>
                  <select
                    value={form.source ?? "other"}
                    onChange={e => set("source", e.target.value)}
                    className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500"
                  >
                    {SOURCE_ORDER.map(s => <option key={s} value={s}>{t(`leadSources.${s}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">{t("common.status")}</label>
                  <select
                    value={form.status ?? "new"}
                    onChange={e => set("status", e.target.value)}
                    className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500"
                  >
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{t(`leadStatuses.${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <Field label={t("common.assigned")} value={form.assigned_to ?? ""} onChange={v => set("assigned_to", v)} />
              <div>
                <label className="text-sm text-gray-500 block mb-1">{t("common.notes")}</label>
                <textarea
                  rows={3}
                  value={form.notes ?? ""}
                  onChange={e => set("notes", e.target.value)}
                  className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name?.trim()}
                className="px-4 py-2 border border-gray-800 text-gray-900 text-sm rounded-lg hover:bg-gray-100 transition disabled:opacity-40"
              >
                {saving ? t("common.saving") : t("common.save")}
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
      <label className="text-sm text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500 transition"
      />
    </div>
  );
}
