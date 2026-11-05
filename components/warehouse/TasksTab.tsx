"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, type Lang } from "./shared";

interface Task {
  id: number; type: string; description: string; assigned_to: string; status: string; input_kg: number | null; output_kg: number | null;
  waste_kg: number | null; started_at: string | null; completed_at: string | null; notes: string; batch_id: number | null; batch_number: string; item: string;
}
interface Data { rows: Task[]; totals: { open: number; completed: number; input_kg: number; waste_kg: number } }

const STATUS_CLS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200", in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200", cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

// Processing tasks from DIPP FRUICT (Depozit → «Sarcini») — read-only.
export function TasksTab({ lang, onOpenBatch }: { lang: Lang; onOpenBatch: (id: number) => void }) {
  const t = useT();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams({ lang });
  if (status) sp.set("status", status);
  if (type) sp.set("type", type);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<Data>(`/api/warehouse/tasks?${sp.toString()}`);
  const wastePct = data && data.totals.input_kg > 0 ? (data.totals.waste_kg / data.totals.input_kg) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("warehouse.tasksNote")}</span>
      </div>
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("warehouse.tasksOpen")} value={String(data.totals.open)} />
          <StatTile label={t("warehouse.tks_completed")} value={String(data.totals.completed)} />
          <StatTile label={t("warehouse.tasksProcessed")} value={fmtKg(data.totals.input_kg)} unit={t("warehouse.kg")} />
          <StatTile label={t("warehouse.tasksWaste")} value={fmtKg(data.totals.waste_kg)} unit={t("warehouse.kg")}
                    hint={wastePct != null ? `${wastePct.toFixed(1)}%` : undefined} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={["pending", "in_progress", "completed", "cancelled"].map(v => ({ value: v, label: t(`warehouse.tks_${v}`) }))} />
        <Select value={type} onChange={setType} all={t("warehouse.tasksAllTypes")}
                options={["sorting", "washing", "packing", "labeling", "other"].map(v => ({ value: v, label: t(`warehouse.tkt_${v}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("warehouse.tasksSearch")} className={`${inputCls} w-full sm:w-64`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("warehouse.tasksType")}</TableHead>
              <TableHead>{t("warehouse.colBatch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.tasksAssigned")}</TableHead>
              <TableHead className="text-right">{t("warehouse.tasksIn")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("warehouse.tasksOut")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("warehouse.tasksWaste")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.tasksPeriod")}</TableHead>
              <TableHead>{t("warehouse.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("warehouse.tasksEmpty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{t(`warehouse.tkt_${r.type}`)}{r.description && <div className="text-xs text-gray-500">{r.description}</div>}</TableCell>
                <TableCell className="text-sm">
                  {r.batch_id ? <button onClick={() => onOpenBatch(r.batch_id!)} className="font-mono text-brand hover:underline">{r.batch_number}</button> : "—"}
                  <div className="text-xs text-gray-500">{r.item}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{r.assigned_to || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(r.input_kg, 1)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{fmtKg(r.output_kg, 1)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{fmtKg(r.waste_kg, 1)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">{fmtDate(r.started_at, true)}{r.completed_at && <div className="text-xs text-gray-500">→ {fmtDate(r.completed_at, true)}</div>}</TableCell>
                <TableCell><span className={`px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${STATUS_CLS[r.status] ?? STATUS_CLS.pending}`}>{t(`warehouse.tks_${r.status}`)}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
