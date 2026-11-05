"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, Ban, CheckCircle2, CircleDot, Clock, Info, PackageCheck, Plus, Printer, Route, Truck, X, XCircle,
} from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { useConfirm } from "@/lib/confirm";
import { useUrlParam } from "@/hooks/useUrlParam";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch } from "@/components/warehouse/shared";

const TABS = ["trips", "plan", "vehicles", "drivers"] as const;
type Tab = (typeof TABS)[number];
const TRIP_STATUSES = ["planned", "loading", "in_transit", "delivered", "cancelled"] as const;

interface TripRow {
  id: number; number: string; date: string | null; status: string; driver: string; carrier: string; destination: string;
  departed_at: string | null; arrived_at: string | null; cost: number | null; cost_currency: string; vehicle_id: number | null;
  plate: string; stops: number; delivered: number; failed: number; net_kg: number; customers: string;
}
interface TripList { rows: TripRow[]; totals: { count: number; planned: number; in_transit: number; delivered: number; net_kg: number; failed_stops: number } }
interface Stop {
  id: number; sales_doc_id: number; order: number; address: string; status: string; delivered_at: string | null; received_by: string;
  notes: string; sale_number: string; sale_date: string | null; sale_status: string; net_kg: number; amount: number; currency: string;
  customer_id: number | null; customer_name: string; phone: string; sale_plate: string;
}
interface Trip {
  id: number; number: string; date: string | null; status: string; vehicle_id: number | null; plate: string; vehicle_type: string;
  carrier: string; driver: string; driver_phone: string; destination: string; departed_at: string | null; arrived_at: string | null;
  cost: number | null; cost_currency: string; notes: string; created_by: string; created_at: string | null; next: string[];
  stops_editable: boolean; stops: Stop[]; history: { action: string; by: string; at: string | null; changes: Record<string, unknown> }[];
}
interface Sale {
  id: number; number: string; date: string | null; status: string; sale_type: string; net_kg: number; amount: number; currency: string;
  customer_id: number | null; customer_name: string; address: string; country: string; vehicle_id: number | null; plate: string;
}
interface Vehicle {
  id: number; plate: string; type: string; driver: string; active: boolean; trips: number; last_trip: string | null; busy_trip: string;
  busy_status: string; sales: number; sales_kg: number; last_sale: string | null; purchases: number;
}
interface Driver { name: string; plates: string[]; phone: string; trips: number; done: number; active: number; failed: number; last_trip: string | null }

const money = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function TripStatus({ status }: { status: string }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    planned:    { cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: CircleDot },
    loading:    { cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: PackageCheck },
    in_transit: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Truck },
    delivered:  { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    cancelled:  { cls: "bg-gray-100 text-gray-500 border-gray-200", Icon: Ban },
  };
  const c = cfg[status] ?? cfg.planned;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`dlv.st_${status}`)}
    </span>
  );
}

function StopStatus({ status }: { status: string }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    pending:   { cls: "bg-gray-100 text-gray-600 border-gray-200", Icon: Clock },
    delivered: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    failed:    { cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`dlv.stop_${status}`)}
    </span>
  );
}

const kv = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
  </div>
);

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, j };
}

// Deliveries: trips and their stops are kept in the CRM; vehicles and sales
// documents come from DIPP FRUICT and are never changed from here.
export default function DeliveriesPage() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "deliveries", "edit");
  const [tab, setTab] = useState<Tab>("trips");
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ trip?: Trip; sales?: Sale[] } | null>(null);
  const [tick, setTick] = useState(0);
  useUrlParam("tab", v => { if ((TABS as readonly string[]).includes(v)) setTab(v as Tab); });
  useUrlParam("trip", v => { if (Number(v) > 0) setOpen(Number(v)); });
  const changed = () => setTick(x => x + 1);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Route className="w-6 h-6 text-brand" />{t("dlv.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("dlv.subtitle")}</p>
      </div>
      <div className="flex gap-1 mb-4 border-b border-[#dde3ef] overflow-x-auto">
        {TABS.map(k => (
          <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`dlv.tab_${k}`)}
          </button>
        ))}
      </div>
      {tab === "trips" && <TripsTab key={tick} canEdit={canEdit} onOpen={setOpen} onNew={() => setForm({})} />}
      {tab === "plan" && <PlanTab key={tick} canEdit={canEdit} onPlan={sales => setForm({ sales })} />}
      {tab === "vehicles" && <VehiclesTab />}
      {tab === "drivers" && <DriversTab />}

      <TripSheet id={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={changed}
                 onEdit={trip => setForm({ trip })} />
      <Sheet open={form != null} onOpenChange={o => { if (!o) setForm(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{form?.trip ? `${t("common.edit")} · ${form.trip.number}` : t("dlv.newTrip")}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6">
            {form && (
              <TripForm trip={form.trip} preselected={form.sales} onCancel={() => setForm(null)}
                        onSaved={id => { setForm(null); changed(); setTab("trips"); setOpen(id); }} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Trips ────────────────────────────────────────────────────────────────

function TripsTab({ canEdit, onOpen, onNew }: { canEdit: boolean; onOpen: (id: number) => void; onNew: () => void }) {
  const t = useT();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)));
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useUrlParam("q", v => { setQ(v); setQd(v); setDateFrom(""); });
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams();
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (status) sp.set("status", status);
  if (vehicle) sp.set("vehicle_id", vehicle);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<TripList>(`/api/deliveries/trips?${sp.toString()}`);
  const { data: vehicles } = useFetch<Vehicle[]>("/api/deliveries/vehicles");

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("dlv.plannedCount")} value={String(data.totals.planned)} />
          <StatTile label={t("dlv.st_in_transit")} value={String(data.totals.in_transit)} tone={data.totals.in_transit ? "warn" : undefined} />
          <StatTile label={t("dlv.st_delivered")} value={String(data.totals.delivered)}
                    hint={data.totals.failed_stops ? `${t("dlv.failedStops")}: ${data.totals.failed_stops}` : undefined} />
          <StatTile label={t("dlv.netShipped")} value={fmtKg(data.totals.net_kg)} unit={t("warehouse.kg")} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={[{ value: "active", label: t("dlv.onlyActive") }, ...TRIP_STATUSES.map(s => ({ value: s, label: t(`dlv.st_${s}`) }))]} />
        <Select value={vehicle} onChange={setVehicle} all={t("dlv.allVehicles")}
                options={(vehicles ?? []).map(v => ({ value: v.id, label: v.plate }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("dlv.search")} className={`${inputCls} w-full sm:w-56`} />
        {canEdit && (
          <button onClick={onNew} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" />{t("dlv.newTrip")}
          </button>
        )}
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("dlv.colNumber")}</TableHead>
              <TableHead>{t("dlv.colDate")}</TableHead>
              <TableHead>{t("dlv.colVehicle")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("dlv.colRoute")}</TableHead>
              <TableHead className="hidden md:table-cell text-right">{t("dlv.colStops")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("dlv.colNet")}</TableHead>
              <TableHead>{t("dlv.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("dlv.emptyTrips")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id} className={`cursor-pointer ${r.status === "cancelled" ? "opacity-60" : ""}`} onClick={() => onOpen(r.id)}>
                <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{r.number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{r.plate || r.carrier || "—"}</span><div className="text-xs text-gray-500">{r.driver}</div></TableCell>
                <TableCell className="hidden lg:table-cell text-sm max-w-[22rem]">
                  {r.destination && <div className="font-medium">{r.destination}</div>}
                  <div className="truncate text-gray-600">{r.customers || "—"}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums text-sm whitespace-nowrap">
                  {r.status === "in_transit" || r.status === "delivered" ? `${r.delivered}/${r.stops}` : r.stops}
                  {r.failed > 0 && <span className="ml-1 text-red-600 inline-flex items-center"><AlertTriangle className="w-3 h-3" />{r.failed}</span>}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{fmtKg(r.net_kg)}</TableCell>
                <TableCell><TripStatus status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TripSheet({ id, canEdit, onClose, onChanged, onEdit }: {
  id: number | null; canEdit: boolean; onClose: () => void; onChanged: () => void; onEdit: (trip: Trip) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const { data, error, reload } = useFetch<Trip>(id ? `/api/deliveries/trips/${id}` : null);
  const d = data && data.id === id ? data : null;
  const [stopForm, setStopForm] = useState<{ stop: Stop; status: "delivered" | "failed" } | null>(null);
  const refresh = () => { reload(); onChanged(); };

  async function move(status: string) {
    if (status === "cancelled" && !(await confirm({ message: t("dlv.cancelConfirm"), danger: true }))) return;
    const { ok, j } = await send(`/api/deliveries/trips/${id}/status`, "POST", { status });
    if (!ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("dlv.saved")); refresh();
  }
  async function resetStop(stop: Stop) {
    const { ok, j } = await send(`/api/deliveries/trips/${id}/stops/${stop.id}`, "PUT", { status: "pending" });
    if (!ok) { toast.error(j.error ?? t("common.error")); return; }
    refresh();
  }
  const moveLabel = (from: string, to: string) =>
    to === "cancelled" ? t("dlv.do_cancel") : to === "in_transit" && from === "delivered" ? t("dlv.do_undeliver")
      : to === "planned" && from === "cancelled" ? t("dlv.do_restore") : t(`dlv.do_${to}`);
  const canMarkStops = d && ["in_transit", "delivered"].includes(d.status);

  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) { setStopForm(null); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle className="font-mono">{d?.number ?? "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2 flex-wrap">
              <TripStatus status={d.status} />
              <div className="ml-auto flex flex-wrap gap-2">
                {canEdit && d.next.map(s => (
                  <button key={s} onClick={() => move(s)}
                          className={`px-3 py-1.5 rounded-lg text-sm ${s === "delivered" || s === "in_transit" && d.status !== "delivered" ? "bg-brand text-white hover:opacity-90" : "border border-[#dde3ef] hover:bg-gray-50"}`}>
                    {moveLabel(d.status, s)}
                  </button>
                ))}
                {canEdit && d.status !== "cancelled" && (
                  <button onClick={() => onEdit(d)} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("common.edit")}</button>
                )}
                <Link href={`/documents/print/trip_sheet?id=${d.id}`} target="_blank"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
                  <Printer className="w-4 h-4" />{t("dlv.printSheet")}
                </Link>
              </div>
            </div>
            <div>
              {kv(t("dlv.colDate"), fmtDate(d.date))}
              {kv(t("dlv.colVehicle"), d.plate ? `${d.plate}${d.vehicle_type ? ` · ${t(`dirs.opt_${d.vehicle_type}`)}` : ""}` : "—")}
              {d.carrier && kv(t("dlv.carrier"), d.carrier)}
              {kv(t("dlv.driver"), `${d.driver || "—"}${d.driver_phone ? ` · ${d.driver_phone}` : ""}`)}
              {kv(t("dlv.destination"), d.destination || "—")}
              {kv(t("dlv.departed"), d.departed_at ? fmtDate(d.departed_at, true) : "—")}
              {kv(t("dlv.arrived"), d.arrived_at ? fmtDate(d.arrived_at, true) : "—")}
              {kv(t("dlv.cost"), d.cost != null ? `${money(d.cost)} ${d.cost_currency}` : "—")}
              {d.notes && kv(t("common.notes"), d.notes)}
              {kv(t("dlv.createdBy"), `${d.created_by || "—"} · ${fmtDate(d.created_at, true)}`)}
            </div>

            <section>
              <h4 className="font-semibold text-sm mb-2">{t("dlv.stops")} · {d.stops.length} · {fmtKg(d.stops.reduce((a, x) => a + x.net_kg, 0))} {t("warehouse.kg")}</h4>
              <ol className="space-y-2">
                {d.stops.map((x, i) => (
                  <li key={x.id} className="rounded-lg border border-[#dde3ef] p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <div>
                        <span className="text-gray-400 mr-1">{i + 1}.</span>
                        {x.customer_id ? <Link href={`/customers/${x.customer_id}`} className="font-medium text-brand hover:underline">{x.customer_name}</Link> : x.customer_name}
                        <div className="text-xs text-gray-500">{x.address || t("dlv.noAddress")}{x.phone && ` · ${x.phone}`}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          <Link href={`/sales?q=${encodeURIComponent(x.sale_number)}`} className="hover:underline">{x.sale_number}</Link> · {fmtDate(x.sale_date)}
                          {x.sale_plate && d.plate && x.sale_plate !== d.plate && <span className="ml-1 text-amber-700">({t("dlv.salePlate")}: {x.sale_plate})</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="tabular-nums">{fmtKg(x.net_kg, 1)} {t("warehouse.kg")}</div>
                        <div className="text-xs text-gray-500 tabular-nums">{money(x.amount)} {x.currency}</div>
                        <div className="mt-1"><StopStatus status={x.status} /></div>
                      </div>
                    </div>
                    {(x.received_by || x.notes || x.delivered_at) && (
                      <div className="mt-1 text-xs text-gray-600">
                        {x.received_by && <>{t("dlv.receivedBy")}: <b>{x.received_by}</b> · </>}
                        {x.delivered_at && fmtDate(x.delivered_at, true)}
                        {x.notes && <div>{x.notes}</div>}
                      </div>
                    )}
                    {canEdit && canMarkStops && stopForm?.stop.id !== x.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {x.status !== "delivered" && <button onClick={() => setStopForm({ stop: x, status: "delivered" })} className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs">{t("dlv.markDelivered")}</button>}
                        {x.status !== "failed" && <button onClick={() => setStopForm({ stop: x, status: "failed" })} className="px-2.5 py-1 rounded-md border border-red-300 text-red-700 text-xs">{t("dlv.markFailed")}</button>}
                        {x.status !== "pending" && <button onClick={() => resetStop(x)} className="px-2.5 py-1 rounded-md border border-[#dde3ef] text-xs">{t("dlv.markPending")}</button>}
                      </div>
                    )}
                    {stopForm?.stop.id === x.id && (
                      <StopForm key={`${x.id}-${stopForm.status}`} tripId={d.id} stop={x} status={stopForm.status}
                                onCancel={() => setStopForm(null)} onSaved={() => { setStopForm(null); refresh(); }} />
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {d.history.length > 0 && (
              <section>
                <h4 className="font-semibold text-sm mb-2">{t("dlv.history")}</h4>
                <ul className="space-y-1.5 text-sm">
                  {d.history.map((h, i) => (
                    <li key={i} className="border-b border-gray-100 pb-1.5">
                      <span className="font-medium">{t(`dlv.act_${h.action}`)}</span>
                      {h.action === "status" && h.changes.status != null && <> → {t(`dlv.st_${String(h.changes.status)}`)}</>}
                      {h.action === "stop" && <> · {String(h.changes.sale ?? "")} → {t(`dlv.stop_${String(h.changes.status)}`)}</>}
                      <span className="text-gray-400"> · {h.by} · {fmtDate(h.at, true)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StopForm({ tripId, stop, status, onCancel, onSaved }: {
  tripId: number; stop: Stop; status: "delivered" | "failed"; onCancel: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [receivedBy, setReceivedBy] = useState(stop.received_by);
  const [notes, setNotes] = useState(stop.notes);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, j } = await send(`/api/deliveries/trips/${tripId}/stops/${stop.id}`, "PUT", { status, received_by: receivedBy, notes });
    setBusy(false);
    if (!ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("dlv.saved")); onSaved();
  }
  const cls = `${inputCls} w-full py-1`;
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-lg bg-gray-50 p-2 text-xs">
      {status === "delivered" && (
        <label><div className="text-gray-500 mb-0.5">{t("dlv.receivedBy")}</div>
          <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} maxLength={200} className={cls} /></label>
      )}
      <label><div className="text-gray-500 mb-0.5">{status === "failed" ? `${t("dlv.failReason")} *` : t("common.notes")}</div>
        <input required={status === "failed"} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} className={cls} /></label>
      <div className="flex gap-2">
        <button disabled={busy} className="px-3 py-1 rounded-md bg-brand text-white disabled:opacity-50">{status === "delivered" ? t("dlv.markDelivered") : t("dlv.markFailed")}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1 rounded-md border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ── Trip form ────────────────────────────────────────────────────────────

function TripForm({ trip, preselected, onCancel, onSaved }: {
  trip?: Trip; preselected?: Sale[]; onCancel: () => void; onSaved: (id: number) => void;
}) {
  const t = useT();
  const editing = !!trip;
  const stopsEditable = !trip || trip.stops_editable;
  const first = preselected?.find(x => x.vehicle_id);
  const [f, setF] = useState({
    trip_date: trip?.date?.slice(0, 10) ?? iso(new Date()),
    vehicle_id: trip?.vehicle_id ? String(trip.vehicle_id) : first?.vehicle_id ? String(first.vehicle_id) : "",
    carrier: trip?.carrier ?? "", driver: trip?.driver ?? "", driver_phone: trip?.driver_phone ?? "",
    destination: trip?.destination ?? "", cost: trip?.cost != null ? String(trip.cost) : "", cost_currency: trip?.cost != null ? trip.cost_currency : "MDL",
    notes: trip?.notes ?? "",
  });
  const [stops, setStops] = useState<{ sales_doc_id: number; address: string; label: string; kg: number }[]>(() =>
    trip ? trip.stops.map(x => ({ sales_doc_id: x.sales_doc_id, address: x.address, label: `${x.customer_name} · ${x.sale_number}`, kg: x.net_kg }))
      : (preselected ?? []).map(x => ({ sales_doc_id: x.id, address: x.address, label: `${x.customer_name} · ${x.number}`, kg: x.net_kg })));
  const [days, setDays] = useState("30");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: vehicles } = useFetch<Vehicle[]>("/api/deliveries/vehicles");
  const { data: pool } = useFetch<Sale[]>(stopsEditable ? `/api/deliveries/available?days=${days}${trip ? `&trip_id=${trip.id}` : ""}` : null);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const [driverTouched, setDriverTouched] = useState(!!trip?.driver);

  // Driver defaults to the vehicle's driver until the user types their own.
  function pickVehicle(v: string) {
    const veh = vehicles?.find(x => String(x.id) === v);
    setF(x => ({ ...x, vehicle_id: v, driver: driverTouched ? x.driver : veh?.driver ?? "" }));
  }
  useEffect(() => {
    if (driverTouched || !vehicles || !f.vehicle_id || f.driver) return;
    const veh = vehicles.find(x => String(x.id) === f.vehicle_id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (veh?.driver) setF(x => ({ ...x, driver: veh.driver }));
  }, [vehicles, f.vehicle_id, f.driver, driverTouched]);

  const chosen = new Set(stops.map(x => x.sales_doc_id));
  const ql = q.trim().toLowerCase();
  const candidates = (pool ?? []).filter(x => !chosen.has(x.id) && (!ql || `${x.customer_name} ${x.number} ${x.address}`.toLowerCase().includes(ql)));
  const add = (x: Sale) => setStops(s => [...s, { sales_doc_id: x.id, address: x.address, label: `${x.customer_name} · ${x.number}`, kg: x.net_kg }]);
  const moveStop = (i: number, dir: -1 | 1) => setStops(s => {
    const j = i + dir; if (j < 0 || j >= s.length) return s;
    const c = [...s]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = { ...f };
    if (stopsEditable) body.stops = stops.map(x => ({ sales_doc_id: x.sales_doc_id, address: x.address }));
    const { ok, j } = await send(editing ? `/api/deliveries/trips/${trip!.id}` : "/api/deliveries/trips", editing ? "PUT" : "POST", body);
    setBusy(false);
    if (!ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(editing ? t("dlv.saved") : t("dlv.created").replace("{n}", j.number));
    onSaved(j.id ?? trip!.id);
  }

  const cls = `${inputCls} w-full py-1.5`;
  const L = (label: string, el: React.ReactNode, wide = false) => (
    <label className={wide ? "col-span-2" : ""}><div className="text-gray-500 mb-1">{label}</div>{el}</label>
  );
  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        {L(`${t("dlv.colDate")} *`, <input required type="date" value={f.trip_date} onChange={e => set("trip_date", e.target.value)} className={cls} />)}
        {L(t("dlv.colVehicle"), (
          <select value={f.vehicle_id} onChange={e => pickVehicle(e.target.value)} className={cls}>
            <option value="">{t("dlv.hiredTransport")}</option>
            {(vehicles ?? []).filter(v => v.active || String(v.id) === f.vehicle_id).map(v => (
              <option key={v.id} value={v.id}>{v.plate} · {t(`dirs.opt_${v.type}`)}{v.busy_trip ? ` · ${t("dlv.busy")}` : ""}</option>
            ))}
          </select>
        ))}
        {!f.vehicle_id && L(`${t("dlv.carrier")} *`, <input required value={f.carrier} onChange={e => set("carrier", e.target.value)} maxLength={200} className={cls} />, true)}
        {L(t("dlv.driver"), <input value={f.driver} onChange={e => { setDriverTouched(true); set("driver", e.target.value); }} maxLength={200} className={cls} />)}
        {L(t("dlv.driverPhone"), <input value={f.driver_phone} onChange={e => set("driver_phone", e.target.value)} maxLength={50} className={cls} />)}
        {L(t("dlv.destination"), <input value={f.destination} onChange={e => set("destination", e.target.value)} maxLength={300} placeholder={t("dlv.destinationHint")} className={cls} />, true)}
        {L(t("dlv.cost"), <input value={f.cost} onChange={e => set("cost", e.target.value)} inputMode="decimal" className={`${cls} tabular-nums`} />)}
        {L(t("dlv.currency"), <input value={f.cost_currency} onChange={e => set("cost_currency", e.target.value.toUpperCase())} maxLength={3} className={cls} />)}
        {L(t("common.notes"), <input value={f.notes} onChange={e => set("notes", e.target.value)} maxLength={1000} className={cls} />, true)}
      </div>

      {stopsEditable ? (
        <section className="space-y-2">
          <h4 className="font-semibold">{t("dlv.stops")} · {stops.length} · {fmtKg(stops.reduce((a, x) => a + x.kg, 0))} {t("warehouse.kg")}</h4>
          {stops.length === 0 && <p className="text-gray-400">{t("dlv.noStopsYet")}</p>}
          <ol className="space-y-1.5">
            {stops.map((x, i) => (
              <li key={x.sales_doc_id} className="flex items-center gap-2 rounded-lg border border-[#dde3ef] p-2">
                <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{x.label} · <span className="tabular-nums">{fmtKg(x.kg)} {t("warehouse.kg")}</span></div>
                  <input value={x.address} onChange={e => setStops(s => s.map((y, k) => k === i ? { ...y, address: e.target.value } : y))}
                         placeholder={t("dlv.address")} maxLength={500} className={`${inputCls} w-full py-1 mt-1 text-xs`} />
                </div>
                <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30" aria-label="up"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="p-1 disabled:opacity-30" aria-label="down"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => setStops(s => s.filter((_, k) => k !== i))} className="p-1 text-red-600" aria-label="remove"><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ol>
          <div className="rounded-lg border border-dashed border-[#c8d3e8] p-2 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-medium">{t("dlv.addSale")}</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("dlv.searchSale")} className={`${inputCls} py-1 flex-1 min-w-[10rem]`} />
              <select value={days} onChange={e => setDays(e.target.value)} className={`${inputCls} py-1`}>
                {["7", "30", "90", "365"].map(d => <option key={d} value={d}>{t("dlv.lastDays").replace("{n}", d)}</option>)}
              </select>
            </div>
            <div className="max-h-56 overflow-auto divide-y divide-gray-100">
              {!pool ? <div className="text-gray-400 py-2">{t("common.loading")}</div>
                : candidates.length === 0 ? <div className="text-gray-400 py-2">{t("dlv.noFreeSales")}</div>
                : candidates.map(x => (
                  <button type="button" key={x.id} onClick={() => add(x)} className="w-full text-left py-1.5 px-1 hover:bg-gray-50 flex justify-between gap-2">
                    <span className="min-w-0"><span className="font-medium">{x.customer_name}</span> · <span className="font-mono">{x.number}</span> · {fmtDate(x.date)}
                      <span className="block text-xs text-gray-500 truncate">{x.address || "—"}{x.plate && ` · ${x.plate}`}</span></span>
                    <span className="tabular-nums whitespace-nowrap">{fmtKg(x.net_kg)} {t("warehouse.kg")} <Plus className="inline w-3.5 h-3.5 text-brand" /></span>
                  </button>
                ))}
            </div>
          </div>
        </section>
      ) : (
        <p className="text-gray-500 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("dlv.stopsLocked")}</p>
      )}

      <div className="flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? t("common.saving") : t("common.save")}</button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ── Planning: sales not yet in a trip ────────────────────────────────────

function PlanTab({ canEdit, onPlan }: { canEdit: boolean; onPlan: (sales: Sale[]) => void }) {
  const t = useT();
  const [days, setDays] = useState("30");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const { data, error } = useFetch<Sale[]>(`/api/deliveries/available?days=${days}`);
  const ql = q.trim().toLowerCase();
  const rows = (data ?? []).filter(x => !ql || `${x.customer_name} ${x.number} ${x.address} ${x.plate}`.toLowerCase().includes(ql));
  const picked = (data ?? []).filter(x => sel.has(x.id));
  const toggle = (id: number) => setSel(s => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("dlv.planNote")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={days} onChange={e => setDays(e.target.value)} className={inputCls}>
          {["7", "30", "90", "365"].map(d => <option key={d} value={d}>{t("dlv.lastDays").replace("{n}", d)}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("dlv.searchSale")} className={`${inputCls} w-full sm:w-64`} />
        {data && <span className="text-sm text-gray-500">{t("dlv.freeSales")}: {data.length}</span>}
        {canEdit && (
          <button disabled={!picked.length} onClick={() => onPlan(picked)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40">
            <Plus className="w-4 h-4" />{t("dlv.planSelected").replace("{n}", String(picked.length))}
            {picked.length > 0 && <span className="tabular-nums">· {fmtKg(picked.reduce((a, x) => a + x.net_kg, 0))} {t("warehouse.kg")}</span>}
          </button>
        )}
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              {canEdit && <TableHead className="w-8" />}
              <TableHead>{t("dlv.colDate")}</TableHead>
              <TableHead>{t("dlv.colSale")}</TableHead>
              <TableHead>{t("dlv.colCustomer")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("dlv.address")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("dlv.salePlate")}</TableHead>
              <TableHead className="text-right">{t("dlv.colNet")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("dlv.saleStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("dlv.noFreeSales")}</TableCell></TableRow>
            ) : rows.map(x => (
              <TableRow key={x.id} className={canEdit ? "cursor-pointer" : ""} onClick={() => canEdit && toggle(x.id)}>
                {canEdit && <TableCell><input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle(x.id)} onClick={e => e.stopPropagation()} /></TableCell>}
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(x.date)}</TableCell>
                <TableCell className="font-mono text-sm">{x.number}</TableCell>
                <TableCell className="text-sm">{x.customer_name}{x.country && <span className="text-xs text-gray-400"> · {x.country}</span>}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600 max-w-[18rem] truncate">{x.address || "—"}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-sm">{x.plate || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(x.net_kg)}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{t(`dlv.sale_${x.status}`)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Vehicles & drivers ───────────────────────────────────────────────────

function VehiclesTab() {
  const t = useT();
  const { data, error } = useFetch<Vehicle[]>("/api/deliveries/vehicles");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{t("dlv.vehiclesNote")} <Link href="/directories" className="text-brand hover:underline">{t("dlv.toDirectories")}</Link></span>
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("dlv.colVehicle")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("dlv.driver")}</TableHead>
              <TableHead>{t("dlv.now")}</TableHead>
              <TableHead className="text-right">{t("dlv.tripsCount")}</TableHead>
              <TableHead className="hidden md:table-cell text-right">{t("dlv.salesShipped")}</TableHead>
              <TableHead className="hidden lg:table-cell text-right">{t("dlv.purchasesBrought")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("dlv.lastUse")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.map(v => {
              const last = [v.last_trip, v.last_sale].filter(Boolean).sort().pop() ?? null;
              return (
                <TableRow key={v.id} className={v.active ? "" : "opacity-50"}>
                  <TableCell className="text-sm"><span className="font-mono font-medium">{v.plate}</span><div className="text-xs text-gray-500">{t(`dirs.opt_${v.type}`)}{!v.active && ` · ${t("dlv.inactive")}`}</div></TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{v.driver || "—"}</TableCell>
                  <TableCell>{v.busy_trip ? <span className="inline-flex flex-col gap-0.5"><TripStatus status={v.busy_status} /><span className="text-xs font-mono text-gray-500">{v.busy_trip}</span></span> : <span className="text-xs text-emerald-700">{t("dlv.free")}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.trips}</TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular-nums text-sm">{v.sales}<div className="text-xs text-gray-400">{fmtKg(v.sales_kg)} {t("warehouse.kg")}</div></TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular-nums">{v.purchases}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{fmtDate(last)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DriversTab() {
  const t = useT();
  const { data, error } = useFetch<Driver[]>("/api/deliveries/drivers");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("dlv.driversNote")}</span>
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("dlv.driver")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("dlv.colVehicle")}</TableHead>
              <TableHead className="text-right">{t("dlv.tripsCount")}</TableHead>
              <TableHead className="hidden md:table-cell text-right">{t("dlv.st_delivered")}</TableHead>
              <TableHead className="hidden md:table-cell text-right">{t("dlv.failedStops")}</TableHead>
              <TableHead>{t("dlv.now")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("dlv.lastTrip")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("dlv.noDrivers")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.name}>
                <TableCell className="text-sm font-medium">{d.name}{d.phone && <div className="text-xs text-gray-500 font-normal">{d.phone}</div>}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm font-mono">{d.plates.join(", ") || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums">{d.done}</TableCell>
                <TableCell className={`hidden md:table-cell text-right tabular-nums ${d.failed ? "text-red-700" : ""}`}>{d.failed}</TableCell>
                <TableCell>{d.active ? <TripStatus status="in_transit" /> : <span className="text-xs text-emerald-700">{t("dlv.free")}</span>}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{fmtDate(d.last_trip)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
