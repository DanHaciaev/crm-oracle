"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Pencil, Plus } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import type { Field } from "@/lib/directories";
import { fmtKg, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

const KINDS = ["warehouses", "cells", "packaging", "varieties", "vehicles", "profiles", "currencies", "formulas"] as const;
type Kind = (typeof KINDS)[number];

interface Opt { id: number; label: string }
interface Data { fields: Field[]; read_only: boolean; refs: Record<string, Opt[]>; rows: Record<string, unknown>[] }

// Reference tables shared with DIPP FRUICT. The form and table are generated
// from the server's field config (lib/directories.ts), so both sides stay in step.
export default function DirectoriesPage() {
  const t = useT();
  const lang = useLang();
  const { user } = useAuth();
  const mayEdit = can(user?.permissions, "directories", "edit");
  const [kind, setKind] = useState<Kind>("warehouses");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const { data, error, reload } = useFetch<Data>(`/api/directories/${kind}?lang=${lang}`);
  const canEdit = mayEdit && data != null && !data.read_only;

  const label = (f: string) => t(`dirs.f_${f}`);
  const refLabel = (f: Field, v: unknown) => data?.refs[f.ref!]?.find(o => o.id === v)?.label ?? (v == null ? "—" : String(v));
  const show = (f: Field, v: unknown) => {
    if (v == null && kind === "formulas" && f.key === "item_id") return t("dirs.allItems");
    if (v == null || v === "") return "—";
    if (f.type === "ref") return refLabel(f, v);
    if (f.type === "bool") return v ? t("dirs.yes") : t("dirs.no");
    if (f.type === "select") return t(`dirs.opt_${String(v)}`);
    if (f.type === "number") return f.key.endsWith("_kg") ? fmtKg(Number(v)) : String(v);
    return String(v);
  };

  async function toggle(row: Record<string, unknown>) {
    const res = await fetch(`/api/directories/${kind}/${row.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !row.active }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    reload();
  }

  const rows = (data?.rows ?? []).filter(r => showInactive || r.active);
  const listFields = (data?.fields ?? []).filter(f => f.list);
  const inactiveCount = (data?.rows ?? []).filter(r => !r.active).length;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("dirs.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("dirs.subtitle")}</p>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto border-b border-[#dde3ef]">
        {KINDS.map(k => (
          <button key={k} onClick={() => { setKind(k); setEditing(null); }}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${kind === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`dirs.k_${k}`)}
          </button>
        ))}
      </div>

      {data?.read_only && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
          <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t(`dirs.readOnly_${kind}`)}</span>
        </div>
      )}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-sm text-gray-400">{t("dirs.records")}: {data ? data.rows.length - inactiveCount : "…"}</span>
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            {t("dirs.showInactive")} ({inactiveCount})
          </label>
        )}
        {canEdit && (
          <button onClick={() => setEditing({})} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium">
            <Plus className="w-4 h-4" />{t("dirs.add")}
          </button>
        )}
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              {listFields.map(f => <TableHead key={f.key} className={`whitespace-nowrap ${f.type === "number" ? "text-right" : ""}`}>{label(f.key)}</TableHead>)}
              {kind === "warehouses" && <TableHead className="text-right whitespace-nowrap">{t("dirs.batchesNow")}</TableHead>}
              <TableHead>{t("dirs.f_active")}</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={listFields.length + 3} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={listFields.length + 3} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={listFields.length + 3} className="text-center text-gray-400 py-6">{t("dirs.empty")}</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={String(r.id)} className={r.active ? "" : "opacity-50"}>
                {listFields.map(f => (
                  <TableCell key={f.key} className={`text-sm ${f.type === "number" ? "text-right tabular-nums" : ""} ${f.key === "code" ? "font-mono" : ""}`}>{show(f, r[f.key])}</TableCell>
                ))}
                {kind === "warehouses" && <TableCell className="text-right tabular-nums text-sm">{String(r.used ?? 0)}</TableCell>}
                <TableCell>
                  {canEdit ? (
                    <button onClick={() => toggle(r)} role="switch" aria-checked={!!r.active} title={r.active ? t("dirs.deactivate") : t("dirs.activate")}
                            className={`relative inline-flex h-5 w-9 rounded-full transition ${r.active ? "bg-emerald-600" : "bg-gray-300"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${r.active ? "left-4" : "left-0.5"}`} />
                    </button>
                  ) : <span className="text-sm">{r.active ? t("dirs.yes") : t("dirs.no")}</span>}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title={t("common.edit")}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && editing && (
        <EditSheet kind={kind} fields={data.fields} refs={data.refs} row={editing}
                   onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function EditSheet({ kind, fields, refs, row, onClose, onSaved }: {
  kind: Kind; fields: Field[]; refs: Record<string, Opt[]>; row: Record<string, unknown>;
  onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const isNew = row.id == null;
  const [form, setForm] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map(f => [f.key, row[f.key] ?? (f.type === "bool" ? false : "")])));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(isNew ? `/api/directories/${kind}` : `/api/directories/${kind}/${row.id}`, {
      method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    toast.success(isNew ? t("dirs.created").replace("{code}", json.code ?? "") : t("dirs.saved"));
    onSaved();
  }

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{isNew ? t("dirs.newRecord") : t("dirs.editRecord")} · {t(`dirs.k_${kind}`)}</SheetTitle></SheetHeader>
        <form onSubmit={save} className="px-4 pb-6 grid grid-cols-2 gap-3">
          {fields.map(f => {
            const v = form[f.key];
            const set = (x: unknown) => setForm(p => ({ ...p, [f.key]: x }));
            const lbl = <div className="text-gray-500 mb-1">{t(`dirs.f_${f.key}`)}{f.required && " *"}</div>;
            const span = f.wide || f.type === "text" && f.key.startsWith("name") ? "col-span-2" : "";
            if (f.type === "bool") return (
              <label key={f.key} className="col-span-2 sm:col-span-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} />{t(`dirs.f_${f.key}`)}
              </label>
            );
            return (
              <label key={f.key} className={`text-sm ${span}`}>
                {lbl}
                {f.type === "select" ? (
                  <select value={String(v ?? "")} onChange={e => set(e.target.value)} required={f.required} className={`${inputCls} w-full`}>
                    <option value="">—</option>
                    {f.options!.map(o => <option key={o} value={o}>{t(`dirs.opt_${o}`)}</option>)}
                  </select>
                ) : f.type === "ref" ? (
                  <select value={String(v ?? "")} onChange={e => set(e.target.value ? Number(e.target.value) : "")} required={f.required}
                          disabled={!isNew && (f.key === "warehouse_id" || f.key === "item_id")} className={`${inputCls} w-full`}>
                    <option value="">—</option>
                    {(refs[f.ref!] ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : (
                  <input value={String(v ?? "")} onChange={e => set(e.target.value)} maxLength={f.max}
                         inputMode={f.type === "number" ? "decimal" : undefined}
                         required={f.required && !(f.auto && isNew)}
                         placeholder={f.auto && isNew ? t("dirs.autoCode") : undefined}
                         className={`${inputCls} w-full ${f.type === "number" ? "tabular-nums" : ""} ${f.upper ? "uppercase" : ""}`} />
                )}
              </label>
            );
          })}
          <div className="col-span-2 flex items-center gap-2 pt-2">
            <button disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">{busy ? t("common.saving") : t("common.save")}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#dde3ef] text-sm">{t("common.cancel")}</button>
          </div>
          <p className="col-span-2 text-xs text-gray-400">{t("dirs.sharedNote")}</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
