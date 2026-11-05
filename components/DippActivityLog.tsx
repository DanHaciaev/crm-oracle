"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Select, fmtDate, inputCls, useFetch } from "@/components/warehouse/shared";

interface Entry { id: number; at: string | null; actor: string; action: string; entity: string; entity_id: number | null; description: string }
interface Data { rows: Entry[]; total: number; actors: string[]; entities: string[]; actions: string[] }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// DIPP FRUICT's activity journal (AGRO_ACTIVITY_LOG) — who created, changed or
// deleted what in the main app. Entries are written by DIPP FRUICT itself.
export function DippActivityLog() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(() => iso(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState("");
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams();
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (actor) sp.set("actor", actor);
  if (entity) sp.set("entity", entity);
  if (action) sp.set("action", action);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<Data>(`/api/audit-log/dipp?${sp.toString()}`);
  const opts = (l: string[] | undefined) => (l ?? []).map(v => ({ value: v, label: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("auditLog.dippNote")}</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={actor} onChange={setActor} all={t("auditLog.allUsers")} options={opts(data?.actors)} />
        <Select value={entity} onChange={setEntity} all={t("auditLog.allObjects")} options={opts(data?.entities)} />
        <Select value={action} onChange={setAction} all={t("auditLog.allActions")} options={opts(data?.actions)} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("auditLog.dippSearch")} className={`${inputCls} w-full sm:w-56`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("auditLog.colTime")}</TableHead>
              <TableHead>{t("auditLog.colUser")}</TableHead>
              <TableHead>{t("auditLog.colAction")}</TableHead>
              <TableHead>{t("auditLog.colObject")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("auditLog.colDetails")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={5} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("auditLog.empty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.at, true)}</TableCell>
                <TableCell className="text-sm">{r.actor || "—"}</TableCell>
                <TableCell className="text-sm">{r.action}</TableCell>
                <TableCell className="text-sm">{r.entity}{r.entity_id != null && <span className="text-gray-400"> #{r.entity_id}</span>}
                  <div className="md:hidden text-xs text-gray-500">{r.description}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-gray-600">{r.description || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && <div className="text-sm text-gray-400 text-center">{t("auditLog.showing")}: {data.rows.length} / {data.total}</div>}
    </div>
  );
}
