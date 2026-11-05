"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Info, Plus, Printer, ShieldCheck, XCircle } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { useUrlParam } from "@/hooks/useUrlParam";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

const TABS = ["complaints", "checks", "haccp", "blocks"] as const;
type Tab = (typeof TABS)[number];
const CATEGORIES = ["quality", "quantity", "packaging", "delivery", "documents", "other"] as const;
const SEVERITIES = ["low", "medium", "high"] as const;
const STATUSES = ["new", "in_progress", "resolved", "rejected"] as const;
const RESOLUTIONS = ["refund", "discount", "replacement", "return", "none"] as const;

interface Complaint {
  id: number; number: string; customer_id: number; customer_name: string; sales_doc_id: number | null; sale_number: string;
  sale_date: string | null; batch_id: number | null; batch_number: string; received_date: string | null; category: string;
  severity: string; description: string; qty_kg: number | null; claim_amount: number | null; currency: string; status: string;
  responsible: string; due_date: string | null; overdue: boolean; resolution: string; resolution_notes: string;
  compensation_amount: number | null; resolved_by: string; resolved_at: string | null; created_by: string; created_at: string | null;
}
interface ComplaintList { rows: Complaint[]; totals: { count: number; open: number; overdue: number; high: number; resolved: number; rejected: number } }
interface ComplaintDetail extends Complaint { history: { action: string; by: string; at: string | null; changes: Record<string, unknown> }[] }
interface Lookups { customers: { id: number; name: string }[]; users: { username: string; name: string }[] }
interface SaleOpts { docs: { id: number; number: string; date: string | null; currency: string; batches: { id: number; number: string; item: string }[] }[] }

const money = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    new:         { cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: CircleDot },
    in_progress: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
    resolved:    { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    rejected:    { cls: "bg-gray-100 text-gray-500 border-gray-200", Icon: XCircle },
  };
  const c = cfg[status] ?? cfg.new;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
        <c.Icon className="w-3 h-3" />{t(`qual.st_${status}`)}
      </span>
      {overdue && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap bg-red-50 text-red-700 border-red-200">
          <AlertTriangle className="w-3 h-3" />{t("qual.overdue")}
        </span>
      )}
    </span>
  );
}

function Severity({ value }: { value: string }) {
  const t = useT();
  const cls = value === "high" ? "text-red-700" : value === "low" ? "text-gray-500" : "text-amber-700";
  return <span className={`text-xs font-medium ${cls}`}>{t(`qual.sev_${value}`)}</span>;
}

function ResultBadge({ result }: { result: string }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    pass:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    conditional: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
    fail:        { cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
  };
  const c = cfg[result] ?? cfg.conditional;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`qual.res_${result}`)}
    </span>
  );
}

const kv = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
  </div>
);

// Quality: customer complaints are kept in the CRM (full edit); QA checks,
// HACCP measurements and batch blocks come from DIPP FRUICT (read-only).
export default function QualityPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("complaints");
  useUrlParam("tab", v => { if ((TABS as readonly string[]).includes(v)) setTab(v as Tab); });

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-brand" />{t("qual.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("qual.subtitle")}</p>
      </div>
      <div className="flex gap-1 mb-4 border-b border-[#dde3ef] overflow-x-auto">
        {TABS.map(k => (
          <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`qual.tab_${k}`)}
          </button>
        ))}
      </div>
      {tab === "complaints" && <ComplaintsTab />}
      {tab === "checks" && <ChecksTab />}
      {tab === "haccp" && <HaccpTab />}
      {tab === "blocks" && <BlocksTab />}
    </div>
  );
}

// ── Complaints ───────────────────────────────────────────────────────────

function ComplaintsTab() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "quality", "edit");
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [customer, setCustomer] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState<{ customer_id?: number } | null>(null);
  useUrlParam("customer", v => { if (Number(v) > 0) { setCustomer(v); setDateFrom(""); } });
  useUrlParam("complaint", v => { if (Number(v) > 0) { setOpen(Number(v)); setDateFrom(""); } });
  useUrlParam("q", v => { setQ(v); setQd(v); setDateFrom(""); });
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);

  const sp = new URLSearchParams();
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (status === "open") sp.set("open", "1"); else if (status) sp.set("status", status);
  if (category) sp.set("category", category);
  if (customer) sp.set("customer_id", customer);
  if (qd) sp.set("q", qd);
  const { data, error, reload } = useFetch<ComplaintList>(`/api/quality/complaints?${sp.toString()}`);
  const { data: lookups } = useFetch<Lookups>("/api/quality/complaints/options");

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("qual.open")} value={String(data.totals.open)} hint={`${t("qual.ofTotal")} ${data.totals.count}`} />
          <StatTile label={t("qual.overdueCount")} value={String(data.totals.overdue)} tone={data.totals.overdue ? "bad" : undefined} />
          <StatTile label={t("qual.highOpen")} value={String(data.totals.high)} tone={data.totals.high ? "warn" : undefined} />
          <StatTile label={t("qual.closed")} value={String(data.totals.resolved + data.totals.rejected)}
                    hint={`${t("qual.st_resolved")}: ${data.totals.resolved} · ${t("qual.st_rejected")}: ${data.totals.rejected}`} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={[{ value: "open", label: t("qual.onlyOpen") }, ...STATUSES.map(s => ({ value: s, label: t(`qual.st_${s}`) }))]} />
        <Select value={category} onChange={setCategory} all={t("qual.allCategories")}
                options={CATEGORIES.map(c => ({ value: c, label: t(`qual.cat_${c}`) }))} />
        <Select value={customer} onChange={setCustomer} all={t("profit.allCustomers")}
                options={(lookups?.customers ?? []).map(c => ({ value: c.id, label: c.name }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("qual.search")} className={`${inputCls} w-full sm:w-56`} />
        {canEdit && (
          <button onClick={() => setCreating(customer ? { customer_id: Number(customer) } : {})}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" />{t("qual.newComplaint")}
          </button>
        )}
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.colNumber")}</TableHead>
              <TableHead>{t("qual.colDate")}</TableHead>
              <TableHead>{t("qual.colCustomer")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.colCategory")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.colSubject")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("qual.colClaim")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.colResponsible")}</TableHead>
              <TableHead>{t("qual.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("qual.emptyComplaints")}</TableCell></TableRow>
            ) : data.rows.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c.id)}>
                <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{c.number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.received_date)}</TableCell>
                <TableCell className="text-sm">{c.customer_name}<div className="md:hidden text-xs text-gray-500">{t(`qual.cat_${c.category}`)}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{t(`qual.cat_${c.category}`)}<div><Severity value={c.severity} /></div></TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600 max-w-[22rem]">
                  <div className="truncate">{c.description}</div>
                  {(c.sale_number || c.batch_number) && <div className="text-xs text-gray-400 font-mono">{[c.sale_number, c.batch_number].filter(Boolean).join(" · ")}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums text-sm whitespace-nowrap">{c.claim_amount != null ? `${money(c.claim_amount)} ${c.currency}` : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{c.responsible || "—"}{c.due_date && <div className="text-xs text-gray-400">{t("qual.until")} {fmtDate(c.due_date)}</div>}</TableCell>
                <TableCell><StatusBadge status={c.status} overdue={c.overdue} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ComplaintSheet id={open} canEdit={canEdit} lookups={lookups} onClose={() => setOpen(null)} onChanged={reload} />
      <Sheet open={creating != null} onOpenChange={o => { if (!o) setCreating(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{t("qual.newComplaint")}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6">
            {creating && (
              <ComplaintForm lookups={lookups} init={creating.customer_id ? { customer_id: creating.customer_id } : undefined}
                             onCancel={() => setCreating(null)}
                             onSaved={id => { setCreating(null); reload(); setOpen(id); }} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ComplaintForm({ lookups, init, onCancel, onSaved }: {
  lookups: Lookups | null; init?: Partial<Complaint>; onCancel: () => void; onSaved: (id: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const editing = !!init?.id;
  const [f, setF] = useState({
    customer_id: init?.customer_id ? String(init.customer_id) : "",
    received_date: day(init?.received_date) || iso(new Date()),
    category: init?.category ?? "quality", severity: init?.severity ?? "medium",
    sales_doc_id: init?.sales_doc_id ? String(init.sales_doc_id) : "", batch_id: init?.batch_id ? String(init.batch_id) : "",
    qty_kg: init?.qty_kg != null ? String(init.qty_kg) : "", claim_amount: init?.claim_amount != null ? String(init.claim_amount) : "",
    currency: init?.claim_amount != null ? init.currency : "", responsible: init?.responsible ?? "",
    due_date: day(init?.due_date), description: init?.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const { data: opts } = useFetch<SaleOpts>(f.customer_id ? `/api/quality/complaints/options?customer_id=${f.customer_id}&lang=${lang}` : null);
  const docs = opts?.docs ?? [];
  const doc = docs.find(d => String(d.id) === f.sales_doc_id);

  function pickCustomer(v: string) { setF(x => ({ ...x, customer_id: v, sales_doc_id: "", batch_id: "" })); }
  function pickDoc(v: string) {
    const d = docs.find(x => String(x.id) === v);
    setF(x => ({ ...x, sales_doc_id: v, batch_id: d?.batches.length === 1 ? String(d.batches[0].id) : "", currency: x.currency || d?.currency || "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(editing ? `/api/quality/complaints/${init!.id}` : "/api/quality/complaints", {
      method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(editing ? t("qual.saved") : t("qual.created").replace("{n}", j.number));
    onSaved(j.id ?? init!.id);
  }

  const L = (label: string, el: React.ReactNode, wide = false) => (
    <label className={wide ? "col-span-2" : ""}><div className="text-gray-500 mb-1">{label}</div>{el}</label>
  );
  const cls = `${inputCls} w-full py-1.5`;
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 text-sm">
      {L(`${t("qual.colCustomer")} *`, (
        <select required value={f.customer_id} onChange={e => pickCustomer(e.target.value)} className={cls}>
          <option value="">—</option>
          {(lookups?.customers ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          {init?.customer_id && !lookups?.customers.some(c => c.id === init.customer_id) && <option value={init.customer_id}>{init.customer_name}</option>}
        </select>
      ), true)}
      {L(`${t("qual.receivedDate")} *`, <input required type="date" value={f.received_date} max={iso(new Date())} onChange={e => set("received_date", e.target.value)} className={cls} />)}
      {L(t("qual.colCategory"), (
        <select value={f.category} onChange={e => set("category", e.target.value)} className={cls}>
          {CATEGORIES.map(c => <option key={c} value={c}>{t(`qual.cat_${c}`)}</option>)}
        </select>
      ))}
      {L(t("qual.sale"), (
        <select value={f.sales_doc_id} onChange={e => pickDoc(e.target.value)} disabled={!f.customer_id} className={cls}>
          <option value="">{t("qual.noSale")}</option>
          {docs.map(d => <option key={d.id} value={d.id}>{d.number} · {fmtDate(d.date)}</option>)}
        </select>
      ))}
      {L(t("qual.batch"), (
        <select value={f.batch_id} onChange={e => set("batch_id", e.target.value)} disabled={!doc} className={cls}>
          <option value="">—</option>
          {(doc?.batches ?? []).map(b => <option key={b.id} value={b.id}>{b.number} · {b.item}</option>)}
          {!doc && init?.batch_id && <option value={init.batch_id}>{init.batch_number}</option>}
        </select>
      ))}
      {L(t("qual.severity"), (
        <select value={f.severity} onChange={e => set("severity", e.target.value)} className={cls}>
          {SEVERITIES.map(s => <option key={s} value={s}>{t(`qual.sev_${s}`)}</option>)}
        </select>
      ))}
      {L(t("qual.qtyKg"), <input value={f.qty_kg} onChange={e => set("qty_kg", e.target.value)} inputMode="decimal" className={`${cls} tabular-nums`} />)}
      {L(t("qual.claimAmount"), <input value={f.claim_amount} onChange={e => set("claim_amount", e.target.value)} inputMode="decimal" className={`${cls} tabular-nums`} />)}
      {L(t("qual.currency"), <input value={f.currency} onChange={e => set("currency", e.target.value.toUpperCase())} maxLength={3} placeholder="MDL" className={cls} />)}
      {L(t("qual.colResponsible"), (
        <select value={f.responsible} onChange={e => set("responsible", e.target.value)} className={cls}>
          <option value="">—</option>
          {(lookups?.users ?? []).map(u => <option key={u.username} value={u.username}>{u.name}</option>)}
        </select>
      ))}
      {L(t("qual.dueDate"), <input type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} className={cls} />)}
      {L(`${t("qual.description")} *`, <textarea required rows={4} maxLength={2000} value={f.description} onChange={e => set("description", e.target.value)} placeholder={t("qual.descriptionHint")} className={cls} />, true)}
      <div className="col-span-2 flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? t("common.saving") : t("common.save")}</button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function ComplaintSheet({ id, canEdit, lookups, onClose, onChanged }: {
  id: number | null; canEdit: boolean; lookups: Lookups | null; onClose: () => void; onChanged: () => void;
}) {
  const t = useT();
  const { data, error, reload } = useFetch<ComplaintDetail>(id ? `/api/quality/complaints/${id}` : null);
  const d = data && data.id === id ? data : null;
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<"resolved" | "rejected" | null>(null);
  const refresh = () => { reload(); onChanged(); };
  const isClosed = d?.status === "resolved" || d?.status === "rejected";

  async function setStatus(status: string) {
    const res = await fetch(`/api/quality/complaints/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("qual.saved")); refresh();
  }

  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) { setEditing(false); setClosing(null); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle className="font-mono">{d?.number ?? "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && editing && (
            <ComplaintForm key={d.id} lookups={lookups} init={d} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
          )}
          {d && !editing && <>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={d.status} overdue={d.overdue} />
              <Severity value={d.severity} />
              {canEdit && (
                <div className="ml-auto flex flex-wrap gap-2">
                  {d.status === "new" && <button onClick={() => setStatus("in_progress")} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("qual.takeInWork")}</button>}
                  {!isClosed && <button onClick={() => setClosing("resolved")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:opacity-90">{t("qual.resolve")}</button>}
                  {!isClosed && <button onClick={() => setClosing("rejected")} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("qual.reject")}</button>}
                  {isClosed && <button onClick={() => setStatus("in_progress")} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("qual.reopen")}</button>}
                  <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("common.edit")}</button>
                </div>
              )}
            </div>
            {closing && <CloseForm key={closing} id={d.id} status={closing} init={d} onCancel={() => setClosing(null)} onSaved={() => { setClosing(null); refresh(); }} />}
            <div>
              {kv(t("qual.colCustomer"), <Link href={`/customers/${d.customer_id}`} className="text-brand hover:underline">{d.customer_name}</Link>)}
              {kv(t("qual.receivedDate"), fmtDate(d.received_date))}
              {kv(t("qual.colCategory"), t(`qual.cat_${d.category}`))}
              {kv(t("qual.sale"), d.sale_number ? <Link href={`/sales?q=${encodeURIComponent(d.sale_number)}`} className="text-brand hover:underline font-mono">{d.sale_number} · {fmtDate(d.sale_date)}</Link> : "—")}
              {kv(t("qual.batch"), d.batch_id ? <Link href={`/warehouse?batch=${d.batch_id}`} className="text-brand hover:underline font-mono">{d.batch_number}</Link> : "—")}
              {kv(t("qual.qtyKg"), d.qty_kg != null ? `${fmtKg(d.qty_kg, 1)} ${t("warehouse.kg")}` : "—")}
              {kv(t("qual.claimAmount"), d.claim_amount != null ? `${money(d.claim_amount)} ${d.currency}` : "—")}
              {kv(t("qual.colResponsible"), d.responsible || "—")}
              {kv(t("qual.dueDate"), d.due_date ? fmtDate(d.due_date) : "—")}
              {kv(t("qual.createdBy"), `${d.created_by || "—"} · ${fmtDate(d.created_at, true)}`)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-1">{t("qual.description")}</h4>
              <p className="text-sm whitespace-pre-wrap text-gray-700">{d.description}</p>
            </section>
            {(d.resolution || d.resolution_notes) && (
              <section className={`rounded-lg border p-3 text-sm ${d.status === "resolved" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
                <h4 className="font-semibold mb-1">{t("qual.decision")}{d.resolution && `: ${t(`qual.resol_${d.resolution}`)}`}</h4>
                {d.compensation_amount != null && <div className="mb-1">{t("qual.compensation")}: <b className="tabular-nums">{money(d.compensation_amount)} {d.currency}</b></div>}
                <p className="whitespace-pre-wrap text-gray-700">{d.resolution_notes}</p>
                {d.resolved_by && <div className="text-xs text-gray-500 mt-1">{d.resolved_by} · {fmtDate(d.resolved_at, true)}</div>}
              </section>
            )}
            {d.history.length > 0 && (
              <section>
                <h4 className="font-semibold text-sm mb-2">{t("qual.history")}</h4>
                <ul className="space-y-1.5 text-sm">
                  {d.history.map((h, i) => (
                    <li key={i} className="border-b border-gray-100 pb-1.5">
                      <span className="font-medium">{t(`qual.act_${h.action}`)}</span>
                      {h.changes.status != null && h.action !== "create" && <> → {t(`qual.st_${String(h.changes.status)}`)}</>}
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

function CloseForm({ id, status, init, onCancel, onSaved }: {
  id: number; status: "resolved" | "rejected"; init: Complaint; onCancel: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [resolution, setResolution] = useState(status === "rejected" ? "none" : init.resolution || "refund");
  const [notes, setNotes] = useState(init.resolution_notes);
  const [comp, setComp] = useState(init.compensation_amount != null ? String(init.compensation_amount) : "");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/quality/complaints/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution, resolution_notes: notes, compensation_amount: status === "rejected" ? "" : comp }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("qual.saved")); onSaved();
  }
  const cls = `${inputCls} w-full py-1.5`;
  return (
    <form onSubmit={submit} className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3 grid grid-cols-2 gap-2 text-sm">
      <div className="col-span-2 font-medium">{status === "resolved" ? t("qual.resolveTitle") : t("qual.rejectTitle")}</div>
      {status === "resolved" && <>
        <label><div className="text-gray-500 mb-1">{t("qual.decision")} *</div>
          <select value={resolution} onChange={e => setResolution(e.target.value)} className={cls}>
            {RESOLUTIONS.map(r => <option key={r} value={r}>{t(`qual.resol_${r}`)}</option>)}
          </select></label>
        <label><div className="text-gray-500 mb-1">{t("qual.compensation")} ({init.claim_amount != null ? init.currency : "MDL"})</div>
          <input value={comp} onChange={e => setComp(e.target.value)} inputMode="decimal" className={`${cls} tabular-nums`} /></label>
      </>}
      <label className="col-span-2"><div className="text-gray-500 mb-1">{status === "resolved" ? t("qual.resolutionNotes") : t("qual.rejectReason")} *</div>
        <textarea required rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className={cls} /></label>
      <div className="col-span-2 flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? t("common.saving") : t("common.save")}</button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ── QA checks (DIPP FRUICT, read-only) ───────────────────────────────────

interface Check { id: number; date: string | null; result: string; inspector: string; notes: string; checklist: string; checklist_type: string; batch_id: number | null; batch_number: string; item: string; fails: number }
interface CheckDetail extends Omit<Check, "fails"> { batch_status: string; values: { id: number; name: string; value: string; ok: boolean; critical: boolean; min: number | null; max: number | null }[] }

function ChecksTab() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [result, setResult] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (result) sp.set("result", result);
  if (q.trim()) sp.set("q", q.trim());
  const { data, error } = useFetch<{ rows: Check[]; totals: { count: number; pass: number; conditional: number; fail: number } }>(`/api/quality/checks?${sp.toString()}`);

  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.checksNote")} />
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("qual.checksCount")} value={String(data.totals.count)} />
          <StatTile label={t("qual.res_pass")} value={String(data.totals.pass)} />
          <StatTile label={t("qual.res_conditional")} value={String(data.totals.conditional)} tone={data.totals.conditional ? "warn" : undefined} />
          <StatTile label={t("qual.res_fail")} value={String(data.totals.fail)} tone={data.totals.fail ? "bad" : undefined} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={result} onChange={setResult} all={t("qual.allResults")}
                options={["pass", "conditional", "fail"].map(r => ({ value: r, label: t(`qual.res_${r}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("qual.searchChecks")} className={`${inputCls} w-full sm:w-56`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.colDate")}</TableHead>
              <TableHead>{t("qual.batch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.checklist")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.inspector")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("qual.fails")}</TableHead>
              <TableHead>{t("qual.result")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={6} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("qual.emptyChecks")}</TableCell></TableRow>
            ) : data.rows.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c.id)}>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.date)}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{c.batch_number || "—"}</span><div className="text-xs text-gray-500">{c.item}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{c.checklist}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{c.inspector || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{c.fails}</TableCell>
                <TableCell><ResultBadge result={c.result} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CheckSheet id={open} lang={lang} onClose={() => setOpen(null)} />
    </div>
  );
}

function CheckSheet({ id, lang, onClose }: { id: number | null; lang: string; onClose: () => void }) {
  const t = useT();
  const { data, error } = useFetch<CheckDetail>(id ? `/api/quality/checks/${id}?lang=${lang}` : null);
  const d = data && data.id === id ? data : null;
  const limits = (v: { min: number | null; max: number | null }) =>
    v.min != null && v.max != null ? `${v.min} … ${v.max}` : v.min != null ? `≥ ${v.min}` : v.max != null ? `≤ ${v.max}` : "";
  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>{d ? `${d.checklist} · ${fmtDate(d.date)}` : "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2 flex-wrap">
              <ResultBadge result={d.result} />
              <Link href={`/documents/print/${d.checklist_type === "gmp" ? "gmp_checklist" : "qa_protocol"}?id=${d.id}`} target="_blank"
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
                <Printer className="w-4 h-4" />{t("qual.printProtocol")}
              </Link>
            </div>
            <div>
              {kv(t("qual.batch"), d.batch_id ? <Link href={`/warehouse?batch=${d.batch_id}`} className="text-brand hover:underline font-mono">{d.batch_number}</Link> : "—")}
              {kv(t("qual.item"), d.item || "—")}
              {kv(t("qual.inspector"), d.inspector || "—")}
              {d.notes && kv(t("common.notes"), d.notes)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-2">{t("qual.parameters")}</h4>
              {d.values.map(v => (
                <div key={v.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5">
                  <span>{v.name}{v.critical && <span className="ml-1 text-xs text-red-600">{t("qual.critical")}</span>}
                    {limits(v) && <div className="text-xs text-gray-400">{t("qual.norm")}: {limits(v)}</div>}</span>
                  <span className={`text-right tabular-nums inline-flex items-center gap-1 ${v.ok ? "" : "text-red-700 font-medium"}`}>
                    {v.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5" />}{v.value || "—"}
                  </span>
                </div>
              ))}
            </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── HACCP (DIPP FRUICT, read-only) ───────────────────────────────────────

interface HaccpRecord { id: number; ccp_id: number; ccp_number: string; hazard: string; value: number | null; min: number | null; max: number | null; ok: boolean; deviation: string; action: string; by: string; at: string | null; batch_id: number | null; batch_number: string }
interface Haccp {
  plans: { id: number; code: string; name: string; stage: string; active: boolean; ccps: { id: number; number: string; hazard_type: string; hazard: string; min: number | null; max: number | null; frequency: string; corrective: string; last: HaccpRecord | null }[] }[];
  records: HaccpRecord[]; totals: { records: number; deviations: number };
}

function HaccpTab() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [onlyDev, setOnlyDev] = useState(false);
  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (onlyDev) sp.set("deviations", "1");
  const { data, error } = useFetch<Haccp>(`/api/quality/haccp?${sp.toString()}`);
  const range = (min: number | null, max: number | null) => `${min ?? "—"} … ${max ?? "—"}`;
  const report = new URLSearchParams({ lang });
  if (dateFrom) report.set("date_from", dateFrom);
  if (dateTo) report.set("date_to", dateTo);

  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.haccpNote")} />
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!data && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
      {data?.plans.map(p => (
        <section key={p.id} className="border border-[#c8d3e8] rounded-xl p-4">
          <h3 className="font-semibold">{p.name} <span className="text-xs font-mono text-gray-400">{p.code}</span>{!p.active && <span className="ml-2 text-xs text-gray-400">({t("qual.inactive")})</span>}</h3>
          {p.ccps.length === 0 ? <p className="text-sm text-gray-400 mt-2">{t("qual.noCcps")}</p> : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {p.ccps.map(c => (
                <div key={c.id} className="rounded-lg border border-[#dde3ef] p-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-mono font-medium">{c.number}</span><span className="text-xs text-gray-500">{t(`qual.hz_${c.hazard_type}`)}</span></div>
                  <div className="mt-1">{c.hazard}</div>
                  <div className="text-xs text-gray-500 mt-1">{t("qual.limits")}: <span className="tabular-nums">{range(c.min, c.max)}</span> · {c.frequency}</div>
                  <div className="text-xs mt-1">
                    {c.last ? (
                      <span className={c.last.ok ? "text-emerald-700" : "text-red-700 font-medium"}>
                        {t("qual.lastMeasure")}: {c.last.value ?? "—"} · {fmtDate(c.last.at, true)}
                      </span>
                    ) : <span className="text-gray-400">{t("qual.noMeasures")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
          <input type="checkbox" checked={onlyDev} onChange={e => setOnlyDev(e.target.checked)} />{t("qual.onlyDeviations")}
        </label>
        {data && <span className="text-sm text-gray-500">{t("qual.measures")}: {data.totals.records} · {t("qual.deviations")}: <b className={data.totals.deviations ? "text-red-700" : ""}>{data.totals.deviations}</b></span>}
        <Link href={`/documents/print/haccp_report?${report.toString()}`} target="_blank"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
          <Printer className="w-4 h-4" />{t("qual.printHaccp")}
        </Link>
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.colDate")}</TableHead>
              <TableHead>CCP</TableHead>
              <TableHead className="text-right">{t("qual.value")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.limits")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.batch")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.actionTaken")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("qual.recordedBy")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data ? null : data.records.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("qual.emptyHaccp")}</TableCell></TableRow>
            ) : data.records.map(r => (
              <TableRow key={r.id} className={r.ok ? "" : "bg-red-50/60"}>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.at, true)}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{r.ccp_number}</span><div className="text-xs text-gray-500">{r.hazard}</div></TableCell>
                <TableCell className={`text-right tabular-nums ${r.ok ? "" : "text-red-700 font-medium"}`}>
                  <span className="inline-flex items-center gap-1">{!r.ok && <AlertTriangle className="w-3.5 h-3.5" />}{r.value ?? "—"}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm tabular-nums">{range(r.min, r.max)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm font-mono">{r.batch_id ? <Link href={`/warehouse?batch=${r.batch_id}`} className="text-brand hover:underline">{r.batch_number}</Link> : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600">{[r.deviation, r.action].filter(Boolean).join(" → ") || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{r.by || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Blocked batches ──────────────────────────────────────────────────────

function BlocksTab() {
  const t = useT();
  const lang = useLang();
  const { data, error } = useFetch<{ id: number; batch_number: string; qty_kg: number; item: string; warehouse: string; blocked_by: string; reason: string; blocked_at: string | null; complaints: number }[]>(`/api/quality/blocks?lang=${lang}`);
  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.blocksNote")} />
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.batch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.colWarehouse")}</TableHead>
              <TableHead className="text-right">{t("qual.qtyKg")}</TableHead>
              <TableHead>{t("qual.blockReason")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.blockedBy")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("qual.tab_complaints")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={6} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("qual.emptyBlocks")}</TableCell></TableRow>
            ) : data.map(b => (
              <TableRow key={b.id}>
                <TableCell className="text-sm"><Link href={`/warehouse?batch=${b.id}`} className="font-mono text-brand hover:underline">{b.batch_number}</Link><div className="text-xs text-gray-500">{b.item}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{b.warehouse || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(b.qty_kg, 1)}</TableCell>
                <TableCell className="text-sm text-gray-700">{b.reason || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{b.blocked_by || "—"}{b.blocked_at && <div className="text-xs text-gray-400">{fmtDate(b.blocked_at, true)}</div>}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{b.complaints || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReadOnlyNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
      <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{text}</span>
    </div>
  );
}
