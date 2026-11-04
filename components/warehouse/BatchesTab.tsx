"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileSpreadsheet, Lock, Unlock } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { BatchStatus, Select, fmtDate, fmtKg, inputCls, useFetch, type Lang, type Options } from "./shared";

interface BatchRow {
  id: number; batch_number: string; status: string; item_name: string; variety_name: string;
  warehouse_name: string; cell_code: string; supplier_name: string; purchase_doc: string;
  initial_kg: number; current_kg: number; reserved_kg: number;
  received_at: string | null; expiry_date: string | null; age_days: number | null; block_reason: string;
}

export function BatchesTab({ lang, options, initial, onOpenBatch, reloadKey }: {
  lang: Lang; options: Options | null; initial: Record<string, string>;
  onOpenBatch: (id: number) => void; reloadKey: number;
}) {
  const t = useT();
  const [warehouse, setWarehouse] = useState(initial.warehouse_id ?? "");
  const [item, setItem]           = useState(initial.item_id ?? "");
  const [supplier, setSupplier]   = useState("");
  const [status, setStatus]       = useState("");
  const [q, setQ]                 = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [onlyStock, setOnlyStock] = useState(true);

  useEffect(() => { const h = setTimeout(() => setQDebounced(q), 300); return () => clearTimeout(h); }, [q]);

  const sp = new URLSearchParams({ lang, only_stock: onlyStock ? "1" : "0", r: String(reloadKey) });
  if (warehouse) sp.set("warehouse_id", warehouse);
  if (item) sp.set("item_id", item);
  if (supplier) sp.set("supplier_id", supplier);
  if (status) sp.set("status", status);
  if (qDebounced) sp.set("q", qDebounced);
  const { data, error, loading } = useFetch<BatchRow[]>(`/api/warehouse/batches?${sp.toString()}`);

  // Excel goes through the existing "stock by batch" report (same filters).
  const xlsx = new URLSearchParams({ format: "xlsx", lang });
  if (warehouse) xlsx.set("warehouse_id", warehouse);
  if (item) xlsx.set("item_id", item);
  if (supplier) xlsx.set("supplier_id", supplier);
  if (status) xlsx.set("status", status);

  const totalKg = (data ?? []).reduce((a, b) => a + b.current_kg, 0);
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("warehouse.searchBatch")} className={`${inputCls} w-full sm:w-64`} />
        <Select value={warehouse} onChange={setWarehouse} all={t("warehouse.allWarehouses")}
                options={(options?.warehouses ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={item} onChange={setItem} all={t("warehouse.allItems")}
                options={(options?.items ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={supplier} onChange={setSupplier} all={t("warehouse.allSuppliers")}
                options={(options?.suppliers ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={["active", "blocked", "depleted"].map(s => ({ value: s, label: t(`warehouse.status_${s}`) }))} />
        <label className="flex items-center gap-2 text-sm text-gray-600 px-2 py-2">
          <input type="checkbox" checked={onlyStock} onChange={e => setOnlyStock(e.target.checked)} />
          {t("warehouse.onlyStock")}
        </label>
        <a href={`${BASE}/api/reports/stock_batches?${xlsx.toString()}`}
           className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition">
          <FileSpreadsheet className="w-4 h-4" />Excel
        </a>
      </div>

      <div className="text-sm text-gray-400">
        {t("warehouse.found")}: {data?.length ?? "…"}{data?.length === 2000 && ` (${t("warehouse.limit2000")})`} · {fmtKg(totalKg)} {t("warehouse.kg")}
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("warehouse.colBatch")}</TableHead>
              <TableHead>{t("warehouse.colItem")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.colSupplier")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.colWarehouse")}</TableHead>
              <TableHead className="text-right">{t("warehouse.colCurrent")}</TableHead>
              <TableHead className="text-right hidden md:table-cell">{t("warehouse.colReserved")}</TableHead>
              <TableHead className="text-right hidden sm:table-cell">{t("warehouse.colAge")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.colExpiry")}</TableHead>
              <TableHead>{t("warehouse.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={9} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data || (loading && !data.length) ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-6">{t("warehouse.noBatches")}</TableCell></TableRow>
            ) : data.map(b => {
              const expired = b.expiry_date && new Date(b.expiry_date) < new Date() && b.status !== "depleted";
              return (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => onOpenBatch(b.id)}>
                  <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{b.batch_number}</TableCell>
                  <TableCell>{b.item_name}{b.variety_name && <div className="text-xs text-gray-400">{b.variety_name}</div>}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{b.supplier_name || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{b.warehouse_name || "—"}{b.cell_code && ` · ${b.cell_code}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKg(b.current_kg)}</TableCell>
                  <TableCell className="text-right tabular-nums hidden md:table-cell">{b.reserved_kg ? fmtKg(b.reserved_kg) : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums hidden sm:table-cell ${(b.age_days ?? 0) > 90 ? "text-red-600" : (b.age_days ?? 0) > 60 ? "text-amber-600" : ""}`}>
                    {b.age_days ?? "—"}
                  </TableCell>
                  <TableCell className={`hidden lg:table-cell text-sm whitespace-nowrap ${expired ? "text-red-600 font-medium" : ""}`}>{fmtDate(b.expiry_date)}</TableCell>
                  <TableCell><BatchStatus status={b.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Batch card (side sheet) ──────────────────────────────────────────────
interface BatchDetail {
  id: number; batch_number: string; status: string; source_type: string; item_name: string; variety_name: string;
  warehouse_name: string; cell_code: string; initial_kg: number; current_kg: number;
  received_at: string | null; expiry_date: string | null; blocked_by: string; block_reason: string; notes: string;
  purchase: { id: number; doc_number: string; doc_date: string | null } | null;
  supplier: { id: number; name: string } | null; crates: number | null; pallets: number | null;
  sales: { id: number; doc_number: string; doc_date: string | null; status: string; customer_name: string; qty_kg: number }[];
  history: { event_type: string; detail: string; qty_kg: number | null; description: string; event_time: string | null;
             actor: string; from_wh: string; to_wh: string; doc_ref: string }[];
}

export function BatchSheet({ id, lang, canEdit, onClose, onChanged }: {
  id: number | null; lang: Lang; canEdit: boolean; onClose: () => void; onChanged: () => void;
}) {
  const t = useT();
  const { data, error, reload } = useFetch<BatchDetail>(id ? `/api/warehouse/batches/${id}?lang=${lang}` : null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const d = data && data.id === id ? data : null;

  async function act(kind: "block" | "unblock") {
    if (kind === "block" && !reason.trim()) { toast.error(t("warehouse.reasonRequired")); return; }
    setBusy(true);
    const res = await fetch(`/api/warehouse/batches/${id}/${kind}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "block" ? { reason } : { resolution: reason }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    toast.success(t(kind === "block" ? "warehouse.blockedOk" : "warehouse.unblockedOk"));
    setReason("");
    reload(); onChanged();
  }

  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
      <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono">{d?.batch_number ?? "…"}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2"><BatchStatus status={d.status} />
              <span className="text-sm text-gray-500">{d.item_name}{d.variety_name && ` · ${d.variety_name}`}</span></div>

            <div>
              {kv(t("warehouse.colWarehouse"), `${d.warehouse_name || "—"}${d.cell_code ? ` · ${d.cell_code}` : ""}`)}
              {kv(t("warehouse.initial"), `${fmtKg(d.initial_kg, 1)} ${t("warehouse.kg")}`)}
              {kv(t("warehouse.colCurrent"), `${fmtKg(d.current_kg, 1)} ${t("warehouse.kg")}`)}
              {kv(t("warehouse.received"), fmtDate(d.received_at, true))}
              {kv(t("warehouse.colExpiry"), fmtDate(d.expiry_date))}
              {d.supplier && kv(t("warehouse.colSupplier"), <Link href={`/suppliers/${d.supplier.id}`} className="text-brand hover:underline">{d.supplier.name}</Link>)}
              {d.purchase && kv(t("warehouse.purchase"), <Link href={`/purchases/${d.purchase.id}/print`} target="_blank" className="text-brand hover:underline">{d.purchase.doc_number} · {fmtDate(d.purchase.doc_date)}</Link>)}
              {(d.crates != null || d.pallets != null) && kv(t("warehouse.packaging"), `${d.crates ?? "—"} ${t("warehouse.crates")} · ${d.pallets ?? "—"} ${t("warehouse.pallets")}`)}
              {d.notes && kv(t("warehouse.notes"), d.notes)}
            </div>

            {d.status === "blocked" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <div className="font-medium text-red-700">{t("warehouse.blockReason")}: {d.block_reason || "—"}</div>
                {d.blocked_by && <div className="text-red-600/80 text-xs mt-0.5">{d.blocked_by}</div>}
              </div>
            )}

            {canEdit && d.status !== "depleted" && (
              <div className="rounded-lg border border-[#dde3ef] p-3 space-y-2">
                <div className="text-sm font-medium">{d.status === "blocked" ? t("warehouse.unblockTitle") : t("warehouse.blockTitle")}</div>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500}
                  placeholder={d.status === "blocked" ? t("warehouse.resolutionPlaceholder") : t("warehouse.reasonPlaceholder")}
                  className={`${inputCls} w-full`}
                />
                <button
                  onClick={() => act(d.status === "blocked" ? "unblock" : "block")} disabled={busy}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${d.status === "blocked" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  {d.status === "blocked" ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {d.status === "blocked" ? t("warehouse.unblock") : t("warehouse.block")}
                </button>
                <p className="text-xs text-gray-400">{t("warehouse.blockNote")}</p>
              </div>
            )}

            <section>
              <h4 className="font-semibold text-sm mb-2">{t("warehouse.wentTo")}</h4>
              {d.sales.length === 0 ? <div className="text-sm text-gray-400">{t("warehouse.noSales")}</div> : (
                <div className="space-y-1">
                  {d.sales.map(s => (
                    <div key={s.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1">
                      <span><span className="font-mono">{s.doc_number}</span> · {s.customer_name || "—"} <span className="text-gray-400">{fmtDate(s.doc_date)}</span></span>
                      <span className="tabular-nums">{fmtKg(s.qty_kg, 1)} {t("warehouse.kg")}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-2">{t("warehouse.history")}</h4>
              {d.history.length === 0 ? <div className="text-sm text-gray-400">—</div> : (
                <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
                  {d.history.map((h, i) => (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-white border-2 border-brand" />
                      <div className="text-sm">
                        <span className="font-medium">{t(`warehouse.event_${h.event_type === "movement" ? h.detail : h.event_type}`)}</span>
                        {h.qty_kg != null && <span className="tabular-nums"> · {fmtKg(h.qty_kg, 1)} {t("warehouse.kg")}</span>}
                        {(h.from_wh || h.to_wh) && <span className="text-gray-500"> · {h.from_wh || "—"} → {h.to_wh || "—"}</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        {fmtDate(h.event_time, true)}{h.actor && ` · ${h.actor}`}{h.doc_ref && ` · ${h.doc_ref}`}
                      </div>
                      {h.description && <div className="text-xs text-gray-600 mt-0.5">{h.description}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
