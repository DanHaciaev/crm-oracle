"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Check, FileSpreadsheet, Thermometer } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Select, fmtDate, fmtKg, inputCls, useFetch, type Lang, type Options } from "./shared";

const TYPES = ["receipt", "shipment", "transfer", "adjustment", "return", "loss", "processing"];
const INCOMING = ["receipt", "adjustment", "return"];

interface Movements {
  rows: { id: number; created_at: string | null; type: string; qty_kg: number; batch_id: number; batch_number: string;
          item_name: string; from_warehouse: string; to_warehouse: string; reason: string; doc_ref: string; created_by: string }[];
  by_type: { type: string; count: number; kg: number }[];
  total: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function MovementsTab({ lang, options, onOpenBatch }: { lang: Lang; options: Options | null; onOpenBatch: (id: number) => void }) {
  const t = useT();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo]     = useState(iso(today));
  const [type, setType]         = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [item, setItem]         = useState("");
  const [q, setQ]               = useState("");
  const [qd, setQd]             = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);

  const sp = new URLSearchParams({ lang, date_from: dateFrom, date_to: dateTo });
  if (type) sp.set("type", type);
  if (warehouse) sp.set("warehouse_id", warehouse);
  if (item) sp.set("item_id", item);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<Movements>(`/api/warehouse/movements?${sp.toString()}`);

  const xlsx = new URLSearchParams({ format: "xlsx", lang, date_from: dateFrom, date_to: dateTo });
  if (type) xlsx.set("status", type);
  if (warehouse) xlsx.set("warehouse_id", warehouse);
  if (item) xlsx.set("item_id", item);
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={type} onChange={setType} all={t("warehouse.allTypes")} options={TYPES.map(x => ({ value: x, label: t(`warehouse.event_${x}`) }))} />
        <Select value={warehouse} onChange={setWarehouse} all={t("warehouse.allWarehouses")} options={(options?.warehouses ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={item} onChange={setItem} all={t("warehouse.allItems")} options={(options?.items ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("warehouse.searchMovement")} className={`${inputCls} w-full sm:w-56`} />
        <a href={`${BASE}/api/reports/movements?${xlsx.toString()}`}
           className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition">
          <FileSpreadsheet className="w-4 h-4" />Excel
        </a>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2">
          {data.by_type.map(b => (
            <span key={b.type} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm">
              <span className="text-gray-500">{t(`warehouse.event_${b.type}`)}:</span>{" "}
              <span className="font-medium tabular-nums">{b.count} · {fmtKg(b.kg)} {t("warehouse.kg")}</span>
            </span>
          ))}
          {data.total > data.rows.length && <span className="text-xs text-gray-400 self-center">{t("warehouse.shownOf").replace("{n}", String(data.rows.length)).replace("{total}", String(data.total))}</span>}
        </div>
      )}

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[62vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("warehouse.colDate")}</TableHead>
              <TableHead>{t("warehouse.colType")}</TableHead>
              <TableHead>{t("warehouse.colBatch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.colItem")}</TableHead>
              <TableHead className="text-right">{t("warehouse.colQty")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.colRoute")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.colDoc")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("warehouse.noMovements")}</TableCell></TableRow>
            ) : data.rows.map(m => {
              const sign = INCOMING.includes(m.type) ? "+" : m.type === "transfer" ? "" : "−";
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-sm whitespace-nowrap">{fmtDate(m.created_at, true)}</TableCell>
                  <TableCell className="text-sm">{t(`warehouse.event_${m.type}`)}</TableCell>
                  <TableCell><button onClick={() => onOpenBatch(m.batch_id)} className="font-mono text-sm text-brand hover:underline">{m.batch_number}</button></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{m.item_name}</TableCell>
                  <TableCell className={`text-right tabular-nums ${sign === "+" ? "text-emerald-700" : sign === "−" ? "text-red-700" : ""}`}>{sign}{fmtKg(m.qty_kg, 1)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-gray-600">{m.from_warehouse || "—"} → {m.to_warehouse || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-gray-600">{m.doc_ref || "—"}{m.reason && <div className="text-xs text-gray-400">{m.reason}</div>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Cells & cold rooms ───────────────────────────────────────────────────
interface Cells {
  cells: { id: number; code: string; name: string; cell_type: string; warehouse_name: string; active: boolean;
           capacity_kg: number | null; temp_min: number | null; temp_max: number | null;
           humidity_min: number | null; humidity_max: number | null; stock_kg: number; batches: number; open_alerts: number;
           last_temp: number | null; last_humidity: number | null; last_reading_at: string | null }[];
  alerts: { id: number; cell_code: string; warehouse_name: string; alert_type: string; threshold: number | null;
            actual: number | null; acknowledged: boolean; acknowledged_by: string; acknowledged_at: string | null; created_at: string | null }[];
}

export function CellsTab({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const { data, error, reload } = useFetch<Cells>(`/api/warehouse/cells`);
  const [busy, setBusy] = useState<number | null>(null);

  async function ack(id: number) {
    setBusy(id);
    const res = await fetch(`/api/warehouse/alerts/${id}/ack`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    toast.success(t("warehouse.ackOk"));
    reload();
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-gray-400">{t("common.loading")}</div>;
  const range = (lo: number | null, hi: number | null, unit: string) =>
    lo == null && hi == null ? "—" : `${lo ?? "…"} … ${hi ?? "…"} ${unit}`;

  return (
    <div className="space-y-6">
      {data.cells.length === 0 ? (
        <div className="border border-dashed border-[#c8d3e8] rounded-xl p-8 text-center text-sm text-gray-400">{t("warehouse.noCells")}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.cells.map(c => {
            const pct = c.capacity_kg ? Math.round((c.stock_kg / c.capacity_kg) * 100) : null;
            const tempBad = c.last_temp != null && ((c.temp_min != null && c.last_temp < c.temp_min) || (c.temp_max != null && c.last_temp > c.temp_max));
            return (
              <div key={c.id} className={`border rounded-xl p-4 ${c.open_alerts ? "border-red-300" : "border-[#c8d3e8]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold font-mono">{c.code}</div>
                    <div className="text-xs text-gray-500">{c.name} · {c.warehouse_name || "—"}</div>
                  </div>
                  {c.open_alerts > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      <BellRing className="w-3 h-3" />{c.open_alerts}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm flex justify-between"><span className="text-gray-500">{t("warehouse.loadLabel")}</span>
                  <span className="tabular-nums">{fmtKg(c.stock_kg)} / {c.capacity_kg != null ? fmtKg(c.capacity_kg) : "—"} {t("warehouse.kg")}</span></div>
                {pct != null && (
                  <div className="h-2 rounded bg-gray-100 mt-1 overflow-hidden" title={`${pct}%`}>
                    <div className={`h-full rounded ${pct > 100 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-gray-400">{t("warehouse.tempRange")}</div><div>{range(c.temp_min, c.temp_max, "°C")}</div></div>
                  <div>
                    <div className="text-gray-400">{t("warehouse.lastReading")}</div>
                    <div className={`flex items-center gap-1 ${tempBad ? "text-red-600 font-semibold" : ""}`}>
                      <Thermometer className="w-3 h-3" />{c.last_temp != null ? `${c.last_temp} °C` : "—"}
                      {c.last_humidity != null && <span className="text-gray-500 font-normal"> · {c.last_humidity}%</span>}
                    </div>
                    {c.last_reading_at && <div className="text-gray-400">{fmtDate(c.last_reading_at, true)}</div>}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400">{c.batches} {t("warehouse.batchesShort")}</div>
              </div>
            );
          })}
        </div>
      )}

      <section>
        <h3 className="font-semibold mb-2">{t("warehouse.alerts")}</h3>
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("warehouse.colDate")}</TableHead>
                <TableHead>{t("warehouse.colCell")}</TableHead>
                <TableHead>{t("warehouse.colType")}</TableHead>
                <TableHead className="text-right">{t("warehouse.colThreshold")}</TableHead>
                <TableHead className="text-right">{t("warehouse.colActual")}</TableHead>
                <TableHead>{t("warehouse.colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.alerts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("warehouse.noAlerts")}</TableCell></TableRow>
              ) : data.alerts.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm whitespace-nowrap">{fmtDate(a.created_at, true)}</TableCell>
                  <TableCell className="text-sm">{a.cell_code || "—"}<div className="text-xs text-gray-400">{a.warehouse_name}</div></TableCell>
                  <TableCell className="text-sm">{a.alert_type || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.threshold ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-700 font-medium">{a.actual ?? "—"}</TableCell>
                  <TableCell>
                    {a.acknowledged ? (
                      <span className="text-xs text-gray-500"><Check className="w-3 h-3 inline" /> {a.acknowledged_by} · {fmtDate(a.acknowledged_at, true)}</span>
                    ) : canEdit ? (
                      <button onClick={() => ack(a.id)} disabled={busy === a.id}
                              className="px-2.5 py-1 rounded-md border border-[#dde3ef] text-xs hover:bg-gray-50 disabled:opacity-50">
                        {t("warehouse.acknowledge")}
                      </button>
                    ) : <span className="text-xs text-red-600">{t("warehouse.open")}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
