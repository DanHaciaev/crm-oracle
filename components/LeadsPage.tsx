/* eslint-disable react-hooks/static-components */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/lib/confirm";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from "@dnd-kit/core";
import { useT } from "@/lib/locale";

interface Lead {
  id: number; name: string; company: string | null;
  phone: string | null; email: string | null;
  source: string; status: string; notes: string | null;
  assigned_to: string | null; customer_id: number | null;
  created_by: string | null; created_at: string | null; updated_at: string | null;
  loss_reason: string | null;
  expected_close: string | null;
  pipeline_id: number | null;
}

interface Pipeline {
  id: number; name: string; description: string | null;
  is_default: boolean; lead_count: number;
}

const STATUS_ORDER = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const SOURCE_ORDER = ["web", "referral", "cold_call", "social", "exhibition", "other"];
const LOSS_REASON_OPTIONS = ["price", "competitor", "no_budget", "no_contact", "timing", "other"];

const STATUS_CLS: Record<string, string> = {
  new: "border-sky-500/50    text-sky-500    bg-sky-50",
  contacted: "border-blue-500/50   text-blue-500   bg-blue-50",
  qualified: "border-violet-500/50 text-violet-500 bg-violet-50",
  proposal: "border-amber-500/50  text-amber-500  bg-amber-50",
  won: "border-emerald-500/50 text-emerald-600 bg-emerald-50",
  lost: "border-red-500/50    text-red-500    bg-red-50",
};

const COLUMN_BAR: Record<string, string> = {
  new: "bg-sky-400",
  contacted: "bg-blue-500",
  qualified: "bg-violet-500",
  proposal: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-red-400",
};

const COLUMN_RING: Record<string, string> = {
  new: "ring-sky-300",
  contacted: "ring-blue-300",
  qualified: "ring-violet-300",
  proposal: "ring-amber-300",
  won: "ring-emerald-300",
  lost: "ring-red-300",
};

const CARD_LEFT: Record<string, string> = {
  new: "border-l-sky-400",
  contacted: "border-l-blue-400",
  qualified: "border-l-violet-400",
  proposal: "border-l-amber-400",
  won: "border-l-emerald-400",
  lost: "border-l-red-300",
};

function fmtDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function computeScore(lead: Lead): number {
  let s = 0;
  if (lead.phone) s += 20;
  if (lead.email) s += 15;
  const srcPts: Record<string, number> = { referral: 25, exhibition: 20, web: 15, social: 10, cold_call: 10, other: 5 };
  s += srcPts[lead.source] ?? 5;
  const stagePts: Record<string, number> = { proposal: 35, qualified: 25, contacted: 10 };
  s += stagePts[lead.status] ?? 0;
  const dt = lead.updated_at ?? lead.created_at;
  if (dt) {
    const days = (Date.now() - new Date(dt).getTime()) / 86400000;
    if (days <= 7) s += 15;
    else if (days <= 30) s += 8;
  }
  return Math.min(100, s);
}

function scoreMeta(score: number) {
  if (score >= 70) return { cls: "bg-red-50 border-red-300 text-red-600", icon: "🔥" };
  if (score >= 50) return { cls: "bg-orange-50 border-orange-300 text-orange-600", icon: "♨" };
  if (score >= 30) return { cls: "bg-amber-50 border-amber-300 text-amber-600", icon: "◉" };
  return { cls: "bg-gray-50 border-[#c8d3e8] text-gray-400", icon: "○" };
}

function isStale(lead: Lead): boolean {
  if (lead.status === "won" || lead.status === "lost") return false;
  const dt = lead.updated_at ?? lead.created_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) / 86400000 > 14;
}

function daysSince(dt: string | null): number {
  if (!dt) return 999;
  return (Date.now() - new Date(dt).getTime()) / 86400000;
}

const BLANK: Partial<Lead> = {
  name: "", company: "", phone: "", email: "",
  source: "other", status: "new", notes: "", assigned_to: "",
  loss_reason: null, expected_close: null,
};

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const m = scoreMeta(score);
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${m.cls}`}>
      {m.icon} {score}
    </span>
  );
}

// ─── Loss reason badge ────────────────────────────────────────────────────────

function LossReasonBadge({ reason, t }: { reason: string; t: (k: string) => string }) {
  const label = t(`leads.lossReasons.${reason}`) || reason;
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-red-300 text-red-600 bg-red-50">
      {label}
    </span>
  );
}

// ─── Card content (shared between draggable card and drag overlay) ────────────

function TgBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-600 border border-sky-200 shrink-0">
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.035 9.593c-.15.676-.546.84-1.107.522l-3.07-2.262-1.482 1.426c-.163.163-.3.3-.617.3l.22-3.118 5.674-5.126c.247-.22-.054-.342-.383-.122L7.26 14.748l-3.025-.944c-.657-.205-.67-.657.137-.972l11.804-4.553c.548-.198 1.027.134.386.969z" />
      </svg>
      TG
    </span>
  );
}

function CardContent({ lead, onSelect, selected = false, dragging = false, t }: {
  lead: Lead; onSelect: (l: Lead) => void;
  selected?: boolean; dragging?: boolean;
  t: (k: string) => string;
}) {
  const leftCls = CARD_LEFT[lead.status] ?? "border-l-gray-300";

  return (
    <div
      onClick={dragging ? undefined : () => onSelect(lead)}
      className={`bg-white border border-[#e2e8f0] border-l-4 rounded-lg p-3 transition-all select-none cursor-pointer ${leftCls}
        ${dragging
          ? "shadow-2xl rotate-1 scale-105"
          : selected
            ? "shadow-md ring-2 ring-brand/30"
            : "shadow-sm hover:shadow-md"
        }`}
    >
      {/* Name + TG badge */}
      <div className="flex items-center gap-1.5 min-w-0 mb-1">
        {lead.source === "telegram" && <TgBadge />}
        <span className="font-semibold text-gray-900 text-sm leading-snug truncate">{lead.name}</span>
      </div>

      {/* Company */}
      {lead.company && (
        <div className="text-xs text-gray-500 truncate mb-0.5">{lead.company}</div>
      )}

      {/* Phone */}
      {lead.phone && (
        <div className="text-xs text-gray-400 font-mono">{lead.phone}</div>
      )}

      {/* Assigned + close date */}
      <div className="flex items-center justify-between mt-1.5 gap-2">
        {lead.assigned_to && (
          <div className="text-[10px] text-gray-400 truncate">{lead.assigned_to}</div>
        )}
        {lead.expected_close && (
          <div className="text-[10px] text-gray-400 shrink-0 ml-auto">до {fmtDate(lead.expected_close)}</div>
        )}
      </div>

      {/* Bottom badges */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <ScoreBadge score={computeScore(lead)} />
        {isStale(lead) && (
          <span className="text-[10px] text-amber-500 font-medium">
            ⚠ {Math.floor(daysSince(lead.updated_at ?? lead.created_at))}д
          </span>
        )}
        {lead.status === "lost" && lead.loss_reason && (
          <LossReasonBadge reason={lead.loss_reason} t={t} />
        )}
      </div>
    </div>
  );
}

// ─── Draggable card ───────────────────────────────────────────────────────────

function DraggableCard({ lead, onSelect, selectedId, t }: {
  lead: Lead; onSelect: (l: Lead) => void; selectedId: number | null;
  t: (k: string) => string;
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
      <CardContent lead={lead} onSelect={onSelect} selected={selectedId === lead.id} t={t} />
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({ status, leads, onSelect, onAdd, selectedId, t }: {
  status: string; leads: Lead[];
  onSelect: (l: Lead) => void;
  onAdd: (status: string) => void;
  selectedId: number | null;
  t: (k: string) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const bar = COLUMN_BAR[status] ?? "bg-gray-400";
  const ring = COLUMN_RING[status] ?? "ring-gray-300";

  return (
    <div className="flex flex-col flex-1 min-w-52">
      {/* Column header */}
      <div className="rounded-xl bg-white border border-[#e2e8f0] shadow-sm mb-2 overflow-hidden">
        <div className={`h-1 w-full ${bar}`} />
        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {t(`leadStatuses.${status}`) || status}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${bar}`}>
              {leads.length}
            </span>
            <button
              onClick={() => onAdd(status)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition text-base leading-none"
              title={t("leads.newLead")}
            >+</button>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 min-h-24 rounded-xl p-1 transition-all duration-150
          ${isOver ? `ring-2 bg-white/60 ${ring}` : ""}`}
      >
        {leads.length === 0 && !isOver && (
          <div className="rounded-lg border border-dashed border-[#d1d9e8] py-8 text-center text-xs text-gray-300">
            пусто
          </div>
        )}
        {leads.map(lead => (
          <DraggableCard key={lead.id} lead={lead} onSelect={onSelect} selectedId={selectedId} t={t} />
        ))}
      </div>
    </div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────

function KanbanBoard({ leads, onSelect, onAdd, onStatusChange, selectedId, t }: {
  leads: Lead[];
  onSelect: (l: Lead) => void;
  onAdd: (status: string) => void;
  onStatusChange: (id: number, newStatus: string) => void;
  selectedId: number | null;
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
      <div className="flex gap-3 pb-4 pt-1 flex-1 flex-wrap">
        {STATUS_ORDER.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            leads={byStatus[status] ?? []}
            onSelect={onSelect}
            onAdd={onAdd}
            selectedId={selectedId}
            t={t}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeLead && (
          <CardContent lead={activeLead} onSelect={() => { }} dragging t={t} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Lead detail panel ────────────────────────────────────────────────────────

function LeadPanel({ lead, onClose, onDelete, onStatusChange, onUpdate, onProposal, t }: {
  lead: Lead;
  onClose: () => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, s: string) => void;
  onUpdate: (l: Lead) => void;
  onProposal: (l: Lead) => void;
  t: (k: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Lead>(lead);

  useEffect(() => { setForm(lead); setEditing(false); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function f(k: keyof Lead, v: string | null) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        company: form.company || null,
        phone: form.phone || null,
        email: form.email || null,
        source: form.source,
        status: form.status,
        assigned_to: form.assigned_to || null,
        expected_close: form.expected_close || null,
        notes: form.notes || null,
        loss_reason: form.status === "lost" ? (form.loss_reason || null) : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onUpdate(form);
      if (form.status !== lead.status) onStatusChange(lead.id, form.status);
      setEditing(false);
    }
  }

  const initials = lead.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const PanelInput = ({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
    <div>
      <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-sm border border-[#c8d3e8] rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-[#516895] transition" />
    </div>
  );

  const PIPELINE = ["new", "contacted", "qualified", "proposal", "won"] as const;
  const pipeIdx = PIPELINE.indexOf(lead.status as typeof PIPELINE[number]);
  const isLost = lead.status === "lost";
  const bar = COLUMN_BAR[lead.status] ?? "bg-gray-400";
  const score = computeScore(lead);

  const EditIcon = () => (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l6.286-6.286z" />
    </svg>
  );
  const CloseIcon = () => (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  );

  return (
    <aside className="w-80 shrink-0 border-l border-[#e2e8f0] flex flex-col bg-white overflow-y-auto">

      {/* Colored accent bar */}
      <div className={`h-1 w-full shrink-0 ${bar}`} />

      {/* Top: close + edit */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <span className="text-[11px] text-gray-400 font-mono">#{lead.id}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditing(e => !e); setForm(lead); }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition
              ${editing ? "bg-brand text-white" : "text-gray-400 hover:bg-gray-100"}`}
            title={editing ? "Выйти из редактирования" : t("common.edit")}
          ><EditIcon /></button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Hero: avatar + name + status + score + stepper */}
      {!editing && (
        <div className="px-4 pb-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${bar}`}>
              {initials}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate leading-tight">{lead.name}</div>
              {lead.company && <div className="text-xs text-gray-500 truncate">{lead.company}</div>}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_CLS[lead.status] ?? "border-gray-300 text-gray-500"}`}>
                  {t(`leadStatuses.${lead.status}`) || lead.status}
                </span>
                <ScoreBadge score={score} />
                {isLost && lead.loss_reason && <LossReasonBadge reason={lead.loss_reason} t={t} />}
              </div>
            </div>
          </div>

          {/* Pipeline stepper */}
          {!isLost ? (
            <div>
              <div className="flex gap-1 mb-1">
                {PIPELINE.map((s, i) => {
                  const c = COLUMN_BAR[s] ?? "bg-gray-400";
                  const active = i <= pipeIdx;
                  return (
                    <button key={s}
                      onClick={async () => {
                        await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
                        onStatusChange(lead.id, s);
                      }}
                      title={t(`leadStatuses.${s}`)}
                      className={`flex-1 h-1.5 rounded-full transition-all ${active ? c : "bg-gray-200 hover:bg-gray-300"}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between">
                {PIPELINE.map((s, i) => (
                  <button key={s}
                    onClick={async () => {
                      await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
                      onStatusChange(lead.id, s);
                    }}
                    className={`text-[10px] transition flex-1 text-center ${i === pipeIdx ? `font-semibold ${COLUMN_BAR[s]?.replace("bg-", "text-").replace("-500", "-600").replace("-400", "-500")}` : "text-gray-400 hover:text-gray-600"
                      }`}
                  >
                    {t(`leadStatuses.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-500 font-medium">Лид потерян</span>
              <button
                onClick={async () => {
                  await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "new" }) });
                  onStatusChange(lead.id, "new");
                }}
                className="text-xs text-gray-500 hover:text-brand underline transition"
              >Восстановить</button>
            </div>
          )}
        </div>
      )}

      {/* Edit mode header */}
      {editing && (
        <div className="px-4 pb-2 shrink-0">
          <div className="font-semibold text-gray-900 truncate">{lead.name}</div>
          {lead.company && <div className="text-xs text-gray-400 truncate">{lead.company}</div>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {editing ? (
          /* ── EDIT MODE ── */
          <div className="px-4 py-3 space-y-3 border-t border-[#e8edf5]">
            <PanelInput label={`${t("common.name")} *`} value={form.name ?? ""} onChange={v => f("name", v)} />
            <PanelInput label={t("common.company")} value={form.company ?? ""} onChange={v => f("company", v)} />
            <PanelInput label={t("common.phone")} value={form.phone ?? ""} onChange={v => f("phone", v)} />
            <PanelInput label={t("common.email")} value={form.email ?? ""} onChange={v => f("email", v)} type="email" />

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">{t("common.source")}</label>
                <select value={form.source ?? "other"} onChange={e => f("source", e.target.value)}
                  className="w-full text-sm border border-[#c8d3e8] rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-brand transition">
                  {SOURCE_ORDER.map(s => <option key={s} value={s}>{t(`leadSources.${s}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">{t("common.status")}</label>
                <select value={form.status ?? "new"} onChange={e => f("status", e.target.value)}
                  className="w-full text-sm border border-[#c8d3e8] rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-brand transition">
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{t(`leadStatuses.${s}`)}</option>)}
                </select>
              </div>
            </div>

            {form.status === "lost" && (
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">{t("leads.lossReason")}</label>
                <select value={form.loss_reason ?? "other"} onChange={e => f("loss_reason", e.target.value)}
                  className="w-full text-sm border border-[#c8d3e8] rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-brand transition">
                  {LOSS_REASON_OPTIONS.map(r => <option key={r} value={r}>{t(`leads.lossReasons.${r}`)}</option>)}
                </select>
              </div>
            )}

            <PanelInput label={t("tasks.assignedTo")} value={form.assigned_to ?? ""} onChange={v => f("assigned_to", v)} />
            <PanelInput label={t("leads.expectedClose")} value={form.expected_close?.slice(0, 10) ?? ""} onChange={v => f("expected_close", v)} type="date" />

            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">{t("common.notes")}</label>
              <textarea value={form.notes ?? ""} onChange={e => f("notes", e.target.value)} rows={3}
                className="w-full text-sm border border-[#c8d3e8] rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none focus:border-brand transition resize-none" />
            </div>
          </div>
        ) : (
          /* ── VIEW MODE ── */
          <div className="px-4 py-3 space-y-3 border-t border-[#e8edf5]">

            {/* Contact info block */}
            <div className="rounded-xl border border-[#e8edf5] divide-y divide-[#f0f4fb] overflow-hidden">
              {lead.phone && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">📞</span>
                  <a href={`tel:${lead.phone}`} className="text-sm text-gray-700 font-mono hover:text-brand truncate">{lead.phone}</a>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">✉️</span>
                  <a href={`mailto:${lead.email}`} className="text-sm text-gray-700 hover:text-brand truncate">{lead.email}</a>
                </div>
              )}
              {lead.source && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">📥</span>
                  <span className="text-sm text-gray-600">{t(`leadSources.${lead.source}`) || lead.source}</span>
                </div>
              )}
              {lead.assigned_to && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">👤</span>
                  <span className="text-sm text-gray-600">{lead.assigned_to}</span>
                </div>
              )}
              {lead.expected_close && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">🎯</span>
                  <span className="text-sm text-gray-600">До {fmtDate(lead.expected_close)}</span>
                </div>
              )}
              {lead.created_at && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-sm shrink-0">📅</span>
                  <span className="text-sm text-gray-400">{fmtDate(lead.created_at)}</span>
                </div>
              )}
            </div>

            {lead.notes && (
              <div className="rounded-xl border border-[#e8edf5] px-3 py-2.5">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Заметки</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{lead.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#e8edf5] shrink-0">
        {editing ? (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name?.trim()}
              className="flex-1 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50 transition">
              {saving ? "Сохранение..." : t("common.save")}
            </button>
            <button onClick={() => { setEditing(false); setForm(lead); }}
              className="px-3 py-2 rounded-xl border border-[#e2e8f0] text-sm text-gray-500 hover:bg-gray-50 transition">
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button onClick={() => onProposal(lead)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-brand/5 border border-brand/20 text-sm text-brand hover:bg-brand/10 transition font-medium">
              📄 Создать КП
            </button>
            <button onClick={() => onDelete(lead.id)}
              className="w-full py-2 rounded-xl border border-red-100 text-sm text-red-500 hover:bg-red-50 transition">
              {t("common.delete")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Loss Reason Modal ────────────────────────────────────────────────────────

interface LossReasonModalProps {
  onConfirm: (reason: string, notes: string) => void;
  onCancel: () => void;
  t: (k: string) => string;
}

function LossReasonModal({ onConfirm, onCancel, t }: LossReasonModalProps) {
  const [reason, setReason] = useState("price");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#c8d3e8] rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t("leads.lossReason")}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-xl transition">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-sm text-gray-500 block mb-1">{t("leads.lossReason")}</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500"
            >
              {LOSS_REASON_OPTIONS.map(r => (
                <option key={r} value={r}>{t(`leads.lossReasons.${r}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">{t("common.notes")} ({t("common.cancel").toLowerCase() !== "отмена" ? "optional" : "необязательно"})</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Дополнительные заметки..."
              className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onConfirm(reason, notes)}
            className="px-4 py-2 border border-red-300 text-red-700 text-sm rounded-lg hover:bg-red-50 transition"
          >
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Proposal Modal ───────────────────────────────────────────────────────────

interface ProposalItem { name: string; qty: string; unit: string; price: string; }

function ProposalModal({ lead, onClose, t }: { lead: Lead; onClose: () => void; t: (k: string) => string }) {
  const [items, setItems] = useState<ProposalItem[]>([{ name: "", qty: "1", unit: "шт", price: "" }]);
  const [note, setNote] = useState(`Уважаемый(ая) ${lead.name},\n\nПредлагаем Вам следующие товары и услуги:`);
  const [validity, setValidity] = useState("");
  const [currency, setCurrency] = useState("MDL");
  const [loading, setLoading] = useState(false);

  function addRow() { setItems(p => [...p, { name: "", qty: "1", unit: "шт", price: "" }]); }
  function removeRow(i: number) { setItems(p => p.filter((_, j) => j !== i)); }
  function updateRow(i: number, k: keyof ProposalItem, v: string) {
    setItems(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r));
  }

  const total = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);

  async function generate() {
    setLoading(true);
    const res = await fetch(`/api/leads/${lead.id}/proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(it => ({ name: it.name, qty: parseFloat(it.qty) || 1, unit: it.unit, price: parseFloat(it.price) || 0 })),
        note, validity, currency,
      }),
    });
    setLoading(false);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `КП-${lead.name}.pdf`; a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  const inp = "w-full text-sm border border-[#c8d3e8] rounded-lg px-2 py-1.5 bg-white outline-none focus:border-[#516895] transition";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#c8d3e8] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Коммерческое предложение</h2>
            <p className="text-xs text-gray-400 mt-0.5">{lead.name}{lead.company ? ` · ${lead.company}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl transition">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Действительно до</label>
              <input type="date" value={validity} onChange={e => setValidity(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Валюта</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>
                <option>MDL</option><option>EUR</option><option>USD</option>
              </select>
            </div>
          </div>

          {/* Intro note */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Текст обращения</label>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
              className={`${inp} resize-none`} />
          </div>

          {/* Items table */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Позиции</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_56px_90px_28px] gap-1.5 items-center">
                  <input placeholder="Наименование" value={it.name} onChange={e => updateRow(i, "name", e.target.value)} className={inp} />
                  <input placeholder="Кол-во" value={it.qty} onChange={e => updateRow(i, "qty", e.target.value)} className={`${inp} text-center`} />
                  <input placeholder="Ед." value={it.unit} onChange={e => updateRow(i, "unit", e.target.value)} className={`${inp} text-center`} />
                  <input placeholder="Цена" value={it.price} onChange={e => updateRow(i, "price", e.target.value)} className={`${inp} text-right`} />
                  <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 transition text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <button onClick={addRow}
              className="mt-2 text-sm text-[#516895] hover:underline flex items-center gap-1">
              + Добавить позицию
            </button>
          </div>

          {total > 0 && (
            <div className="text-right text-sm font-semibold text-gray-800">
              Итого: {total.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} {currency}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            {t("common.cancel")}
          </button>
          <button onClick={generate} disabled={loading || items.every(it => !it.name.trim())}
            className="px-5 py-2 bg-[#516895] text-white text-sm font-medium rounded-lg hover:bg-[#3f5278] disabled:opacity-50 transition">
            {loading ? "Генерация..." : "Скачать PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const t = useT();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | null>(null);
  const [form, setForm] = useState<Partial<Lead>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showStale, setShowStale] = useState(false);

  const [proposalLead, setProposalLead] = useState<Lead | null>(null);
  const [lossModal, setLossModal] = useState<{ leadId: number } | null>(null);

  // Pipelines
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<number | null>(null);
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [savingPipeline, setSavingPipeline] = useState(false);

  const fetchPipelines = useCallback(async () => {
    const res = await fetch("/api/pipelines");
    if (res.ok) {
      const data = await res.json() as Pipeline[];
      setPipelines(data);
      if (activePipeline === null && data.length > 0) {
        const def = data.find(p => p.is_default) ?? data[0];
        setActivePipeline(def.id);
      }
    }
  }, [activePipeline]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const url = activePipeline !== null
      ? `/api/leads?pipeline_id=${activePipeline}`
      : "/api/leads";
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setLeads(data as Lead[]);
    setLoading(false);
  }, [t, activePipeline]);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(l => {
      const matchSearch = !q
        || l.name.toLowerCase().includes(q)
        || (l.company ?? "").toLowerCase().includes(q)
        || (l.phone ?? "").toLowerCase().includes(q)
        || (l.email ?? "").toLowerCase().includes(q);
      const matchStale = !showStale || isStale(l);
      return matchSearch && matchStale;
    });
  }, [leads, search, showStale]);

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    setSavingPipeline(true);
    const res = await fetch("/api/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPipelineName.trim() }),
    });
    setSavingPipeline(false);
    if (res.ok) {
      setNewPipelineName("");
      setShowNewPipeline(false);
      await fetchPipelines();
    }
  }

  function openCreate(defaultStatus = "new") {
    setForm({ ...BLANK, status: defaultStatus, pipeline_id: activePipeline });
    setModal("create");
  }

  function handleSelectLead(lead: Lead) {
    setSelectedLead(prev => prev?.id === lead.id ? null : lead);
  }

  function handleLeadUpdate(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    setSelectedLead(updated);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { setModal(null); fetchData(); }
  }

  async function handleDelete(id: number) {
    if (!await confirm({ message: t("leads.deleteConfirm"), danger: true })) return;
    setLeads(prev => prev.filter(l => l.id !== id));
    setSelectedLead(prev => prev?.id === id ? null : prev);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  async function handleStatusChange(leadId: number, newStatus: string) {
    if (newStatus === "lost") {
      // Show loss reason modal before patching
      setLossModal({ leadId });
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    setSelectedLead(prev => prev?.id === leadId ? { ...prev, status: newStatus } : prev);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleLossConfirm(reason: string, notes: string) {
    if (!lossModal) return;
    const { leadId } = lossModal;
    setLossModal(null);
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, status: "lost", loss_reason: reason } : l
    ));
    setSelectedLead(prev =>
      prev?.id === leadId ? { ...prev, status: "lost", loss_reason: reason } : prev
    );
    const body: Record<string, string> = { status: "lost", loss_reason: reason };
    if (notes.trim()) body.notes = notes.trim();
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function handleLossCancel() {
    setLossModal(null);
  }

  function set(k: keyof Lead, v: string | null) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-5 pb-4 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t("leads.searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-8 py-2 border border-[#c8d3e8] bg-white rounded-xl text-sm text-gray-900 outline-none focus:border-[#516895] transition w-56"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 transition">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          )}
        </div>

        {/* Stale filter */}
        <button
          onClick={() => setShowStale(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition ${showStale
            ? "border-amber-400 bg-amber-50 text-amber-700 font-medium"
            : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"
            }`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Нет активности
        </button>

        {/* Search results count */}
        {(search || showStale) && (
          <span className="text-sm text-gray-400">
            {filtered.length} {t("common.of")} {leads.length}
          </span>
        )}

        <button
          onClick={() => openCreate()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#516895] text-white text-sm font-medium rounded-xl hover:bg-[#3f5278] transition"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          {t("leads.newLead")}
        </button>
      </div>

      {/* Pipeline tabs */}
      <div className="px-4 sm:px-8 pb-2 flex items-center gap-2 flex-wrap shrink-0 border-b border-[#c8d3e8]">
        {pipelines.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePipeline(p.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${activePipeline === p.id
                ? "bg-[#516895] text-white border-[#516895]"
                : "border-[#c8d3e8] text-gray-600 hover:bg-gray-50"}`}
          >
            {p.name}
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold
              ${activePipeline === p.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {p.lead_count}
            </span>
          </button>
        ))}
        {isAdmin && (showNewPipeline ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newPipelineName}
              onChange={e => setNewPipelineName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreatePipeline(); if (e.key === "Escape") setShowNewPipeline(false); }}
              placeholder="Название воронки..."
              className="px-2.5 py-1.5 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895] w-40"
            />
            <button onClick={handleCreatePipeline} disabled={savingPipeline || !newPipelineName.trim()}
              className="px-3 py-1.5 bg-[#516895] text-white text-sm rounded-lg disabled:opacity-50">
              {savingPipeline ? "..." : "Создать"}
            </button>
            <button onClick={() => setShowNewPipeline(false)}
              className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewPipeline(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-dashed border-[#c8d3e8] transition"
          >
            + Воронка
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex items-stretch">
        {/* Kanban area — scrollable, has horizontal padding */}
        <div className="flex-1 min-w-0 overflow-auto px-4 sm:px-8 py-4 bg-[#f4f6fb] rounded-2xl mx-4 my-2">
          {loading && <div className="text-center text-gray-400 py-16">{t("common.loading")}</div>}
          {error && <div className="text-center text-red-500 py-8">{error}</div>}
          {!loading && !error && (
            <KanbanBoard
              leads={filtered}
              onSelect={handleSelectLead}
              onAdd={openCreate}
              onStatusChange={handleStatusChange}
              selectedId={selectedLead?.id ?? null}
              t={t}
            />
          )}
        </div>

        {/* Right panel — no padding, reaches bottom and right edge */}
        {selectedLead && (
          <LeadPanel
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onUpdate={handleLeadUpdate}
            onProposal={setProposalLead}
            t={t}
          />
        )}
      </div>

      {/* КП modal */}
      {proposalLead && (
        <ProposalModal lead={proposalLead} onClose={() => setProposalLead(null)} t={t} />
      )}

      {/* Loss reason modal */}
      {lossModal && (
        <LossReasonModal
          t={t}
          onConfirm={handleLossConfirm}
          onCancel={handleLossCancel}
        />
      )}

      {/* Create modal */}
      {modal === "create" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#c8d3e8] rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("leads.newLead")}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-xl transition">×</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label={`${t("common.name")} *`} value={form.name ?? ""} onChange={v => set("name", v)} />
              <Field label={t("common.company")} value={form.company ?? ""} onChange={v => set("company", v)} />
              <Field label={t("common.phone")} value={form.phone ?? ""} onChange={v => set("phone", v)} />
              <Field label={t("common.email")} value={form.email ?? ""} onChange={v => set("email", v)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {/* Loss reason (shown when status is lost) */}
              {form.status === "lost" && (
                <div>
                  <label className="text-sm text-gray-500 block mb-1">{t("leads.lossReason")}</label>
                  <select
                    value={form.loss_reason ?? ""}
                    onChange={e => set("loss_reason", e.target.value || null)}
                    className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500"
                  >
                    <option value="">— {t("leads.lossReason")}</option>
                    {LOSS_REASON_OPTIONS.map(r => (
                      <option key={r} value={r}>{t(`leads.lossReasons.${r}`)}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Expected close date */}
              <div>
                <label className="text-sm text-gray-500 block mb-1">{t("leads.expectedClose")}</label>
                <input
                  type="date"
                  value={form.expected_close ? form.expected_close.slice(0, 10) : ""}
                  onChange={e => set("expected_close", e.target.value || null)}
                  className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500 transition"
                />
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
                className="px-4 py-2 border border-[#c8d3e8] text-gray-900 text-sm rounded-lg hover:bg-gray-100 transition disabled:opacity-40"
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
