"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, Copy, FileDown, FileSignature, Info, Pencil, Plus, Printer, Send, Target, X } from "lucide-react";
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

const STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
const LOSS_REASONS = ["price", "competitor", "no_budget", "no_contact", "timing", "other"] as const;
const CURRENCIES = ["MDL", "EUR", "USD", "RON"];

interface Row {
  id: number; number: string; date: string | null; valid_until: string | null; customer_id: number | null; lead_id: number | null;
  lead_name: string; lead_status: string; client_name: string; currency: string; total: number; status: string; expired: boolean;
  manager: string; sent_at: string | null; decided_at: string | null; lines: number; qty_kg: number;
}
interface List {
  rows: Row[];
  totals: { count: number; draft: number; sent: number; accepted: number; rejected: number; expired: number; win_rate: number | null;
            open_amount: Record<string, number>; won_amount: Record<string, number> };
}
interface Line { item_id: number | null; item_code?: string; description: string; packaging: string; qty_kg: number; price_per_kg: number; amount?: number }
interface Quote {
  id: number; number: string; date: string | null; valid_until: string | null; customer_id: number | null; customer_name: string;
  lead_id: number | null; lead_name: string; lead_status: string; client_name: string; contact_person: string; phone: string; email: string;
  currency: string; delivery_terms: string; payment_terms: string; notes: string; internal_notes: string; discount_pct: number;
  subtotal: number; discount_amount: number; total: number; status: string; expired: boolean; next: string[]; editable: boolean;
  manager: string; manager_name: string; sent_at: string | null; decided_at: string | null; reject_reason: string;
  created_by: string; created_at: string | null; lines: (Line & { id: number; amount: number })[];
  history: { action: string; by: string; at: string | null; changes: Record<string, unknown> }[];
}
interface Lookups {
  customers: { id: number; name: string; country: string }[];
  leads: { id: number; name: string; company: string; status: string; customer_id: number | null; assigned_to: string }[];
  items: { id: number; code: string; name: string }[];
  users: { username: string; name: string }[];
}
type Hints = Record<number, { customer?: { price: number; date: string | null }; any?: { price: number; date: string | null } }>;

const money = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const price = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const amounts = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => `${money(v)} ${c}`).join(" · ") || "—";
const num = (v: string) => Number(v.replace(",", ".").trim());

function QuoteStatus({ status, expired }: { status: string; expired?: boolean }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Send }> = {
    draft:    { cls: "bg-gray-100 text-gray-600 border-gray-200", Icon: Pencil },
    sent:     { cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Send },
    accepted: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    rejected: { cls: "bg-red-50 text-red-700 border-red-200", Icon: Ban },
  };
  const c = cfg[status] ?? cfg.draft;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
        <c.Icon className="w-3 h-3" />{t(`qt.st_${status}`)}
      </span>
      {expired && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="w-3 h-3" />{t("qt.expired")}
        </span>
      )}
    </span>
  );
}

const kv = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
  </div>
);

async function send(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, j };
}

// Commercial offers: kept in the CRM, each linked to a customer and/or a
// deal in the pipeline; printable and downloadable as PDF in RO/RU/EN.
export default function QuotesPage() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "quotes", "edit");
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [manager, setManager] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ quote?: Quote; init?: Partial<Quote> } | null>(null);
  useUrlParam("quote", v => { if (Number(v) > 0) { setOpen(Number(v)); setDateFrom(""); } });
  useUrlParam("customer", v => { if (Number(v) > 0) { setCustomer(v); setDateFrom(""); } });
  useUrlParam("new", v => {
    const [kind, id] = v.split(":");
    if (Number(id) > 0) setForm({ init: kind === "lead" ? { lead_id: Number(id) } : { customer_id: Number(id) } });
  });
  useUrlParam("q", v => { setQ(v); setQd(v); setDateFrom(""); });
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);

  const sp = new URLSearchParams();
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (status) sp.set("status", status);
  if (customer) sp.set("customer_id", customer);
  if (manager) sp.set("manager", manager);
  if (qd) sp.set("q", qd);
  const { data, error, reload } = useFetch<List>(`/api/quotes?${sp.toString()}`);
  const lang = useLang();
  const { data: lookups } = useFetch<Lookups>(`/api/quotes/options?lang=${lang}`);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSignature className="w-6 h-6 text-brand" />{t("qt.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("qt.subtitle")}</p>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile label={t("qt.openOffers")} value={String(data.totals.sent - data.totals.expired)} hint={amounts(data.totals.open_amount)} />
          <StatTile label={t("qt.st_accepted")} value={String(data.totals.accepted)} hint={amounts(data.totals.won_amount)} />
          <StatTile label={t("qt.winRate")} value={data.totals.win_rate == null ? "—" : `${data.totals.win_rate}%`}
                    hint={`${t("qt.st_accepted")} ${data.totals.accepted} · ${t("qt.st_rejected")} ${data.totals.rejected}`} />
          <StatTile label={t("qt.expiredCount")} value={String(data.totals.expired)} tone={data.totals.expired ? "warn" : undefined}
                    hint={`${t("qt.st_draft")}: ${data.totals.draft}`} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={[{ value: "open", label: t("qt.onlyOpen") }, ...STATUSES.map(s => ({ value: s, label: t(`qt.st_${s}`) })), { value: "expired", label: t("qt.expired") }]} />
        <Select value={customer} onChange={setCustomer} all={t("profit.allCustomers")}
                options={(lookups?.customers ?? []).map(c => ({ value: c.id, label: c.name }))} />
        <Select value={manager} onChange={setManager} all={t("qt.allManagers")}
                options={(lookups?.users ?? []).map(u => ({ value: u.username, label: u.name }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("qt.search")} className={`${inputCls} w-full sm:w-56`} />
        {canEdit && (
          <button onClick={() => setForm({ init: customer ? { customer_id: Number(customer) } : {} })}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" />{t("qt.newQuote")}
          </button>
        )}
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qt.colNumber")}</TableHead>
              <TableHead>{t("qt.colDate")}</TableHead>
              <TableHead>{t("qt.colClient")}</TableHead>
              <TableHead className="hidden lg:table-cell text-right">{t("qt.colQty")}</TableHead>
              <TableHead className="text-right">{t("qt.colTotal")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qt.validUntil")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qt.manager")}</TableHead>
              <TableHead>{t("qt.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("qt.empty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{r.number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="text-sm">{r.client_name}{r.lead_name && <div className="text-xs text-gray-500 inline-flex items-center gap-1"><Target className="w-3 h-3" />{r.lead_name}</div>}</TableCell>
                <TableCell className="hidden lg:table-cell text-right tabular-nums text-sm">{fmtKg(r.qty_kg)}<div className="text-xs text-gray-400">{r.lines} {t("qt.linesShort")}</div></TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{money(r.total)} {r.currency}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{fmtDate(r.valid_until)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{lookups?.users.find(u => u.username === r.manager)?.name ?? r.manager ?? "—"}</TableCell>
                <TableCell><QuoteStatus status={r.status} expired={r.expired} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <QuoteSheet id={open} canEdit={canEdit} lang={lang} onClose={() => setOpen(null)} onChanged={reload}
                  onEdit={quote => setForm({ quote })} onOpen={setOpen} />
      <Sheet open={form != null} onOpenChange={o => { if (!o) setForm(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader><SheetTitle>{form?.quote ? `${t("common.edit")} · ${form.quote.number}` : t("qt.newQuote")}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6">
            {form && lookups && (
              <QuoteForm quote={form.quote} init={form.init} lookups={lookups} defaultManager={user?.username ?? ""}
                         onCancel={() => setForm(null)} onSaved={id => { setForm(null); reload(); setOpen(id); }} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function QuoteSheet({ id, canEdit, lang, onClose, onChanged, onEdit, onOpen }: {
  id: number | null; canEdit: boolean; lang: string; onClose: () => void; onChanged: () => void;
  onEdit: (q: Quote) => void; onOpen: (id: number) => void;
}) {
  const t = useT();
  const { data, error, reload } = useFetch<Quote>(id ? `/api/quotes/${id}?lang=${lang}` : null);
  const d = data && data.id === id ? data : null;
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => { reload(); onChanged(); };
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  async function act(url: string, body: unknown, ok: (j: Record<string, unknown>) => void) {
    setBusy(true);
    const r = await send(url, body);
    setBusy(false);
    if (!r.ok) { toast.error(r.j.error ?? t("common.error")); return; }
    ok(r.j);
  }
  const setStatus = (status: string) => act(`/api/quotes/${id}/status`, { status }, j => {
    toast.success(j.lead ? t("qt.savedWithDeal") : t("qt.saved")); refresh();
  });
  const label = (from: string, to: string) =>
    to === "sent" ? (from === "draft" ? t("qt.do_send") : t("qt.do_reopen")) : t(`qt.do_${to}`);

  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) { setRejecting(false); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle className="font-mono">{d?.number ?? "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2 flex-wrap">
              <QuoteStatus status={d.status} expired={d.expired} />
              <div className="ml-auto flex flex-wrap gap-2">
                {canEdit && d.next.map(s => (
                  <button key={s} disabled={busy} onClick={() => s === "rejected" ? setRejecting(true) : setStatus(s)}
                          className={`px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 ${s === "sent" && d.status === "draft" || s === "accepted" ? "bg-brand text-white hover:opacity-90" : "border border-[#dde3ef] hover:bg-gray-50"}`}>
                    {label(d.status, s)}
                  </button>
                ))}
                {canEdit && d.editable && <button onClick={() => onEdit(d)} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">{t("common.edit")}</button>}
              </div>
            </div>
            {rejecting && <RejectForm id={d.id} onCancel={() => setRejecting(false)} onSaved={lead => { setRejecting(false); toast.success(lead ? t("qt.savedWithDeal") : t("qt.saved")); refresh(); }} />}
            <div className="flex flex-wrap gap-2">
              <Link href={`/documents/print/quote?id=${d.id}&lang=${lang}`} target="_blank"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50"><Printer className="w-4 h-4" />{t("qt.print")}</Link>
              {(["ro", "ru", "en"] as const).map(l => (
                <a key={l} href={`${BASE}/api/quotes/${d.id}/pdf?lang=${l}`}
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50"><FileDown className="w-4 h-4" />PDF {l.toUpperCase()}</a>
              ))}
              {canEdit && (
                <button disabled={busy} onClick={() => act(`/api/quotes/${d.id}/duplicate`, {}, j => { toast.success(t("qt.copied").replace("{n}", String(j.number))); onChanged(); onOpen(Number(j.id)); })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50"><Copy className="w-4 h-4" />{t("qt.duplicate")}</button>
              )}
              {canEdit && !d.lead_id && (
                <button disabled={busy} onClick={() => act(`/api/quotes/${d.id}/deal`, {}, () => { toast.success(t("qt.dealCreated")); refresh(); })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand text-brand text-sm hover:bg-brand/5"><Target className="w-4 h-4" />{t("qt.toDeal")}</button>
              )}
            </div>
            <div>
              {kv(t("qt.colClient"), d.customer_id ? <Link href={`/customers/${d.customer_id}`} className="text-brand hover:underline">{d.client_name}</Link> : d.client_name)}
              {d.contact_person && kv(t("qt.contactPerson"), d.contact_person)}
              {(d.phone || d.email) && kv(t("qt.contacts"), [d.phone, d.email].filter(Boolean).join(" · "))}
              {kv(t("qt.deal"), d.lead_id ? <Link href={`/leads?q=${encodeURIComponent(d.lead_name)}`} className="text-brand hover:underline">{d.lead_name} · {t(`leadStatuses.${d.lead_status}`)}</Link> : "—")}
              {kv(t("qt.colDate"), fmtDate(d.date))}
              {kv(t("qt.validUntil"), d.valid_until ? fmtDate(d.valid_until) : "—")}
              {kv(t("qt.manager"), d.manager_name || "—")}
              {d.delivery_terms && kv(t("qt.deliveryTerms"), d.delivery_terms)}
              {d.payment_terms && kv(t("qt.paymentTerms"), d.payment_terms)}
              {d.sent_at && kv(t("qt.sentAt"), fmtDate(d.sent_at, true))}
              {d.decided_at && kv(t("qt.decidedAt"), fmtDate(d.decided_at, true))}
              {d.reject_reason && kv(t("qt.rejectReason"), d.reject_reason)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-2">{t("qt.lines")}</h4>
              <div className="space-y-1">
                {d.lines.map(l => (
                  <div key={l.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5">
                    <span>{l.description}{l.packaging && <span className="text-gray-500"> · {l.packaging}</span>}
                      <div className="text-xs text-gray-400 tabular-nums">{fmtKg(l.qty_kg, l.qty_kg % 1 ? 1 : 0)} {t("warehouse.kg")} × {price(l.price_per_kg)}</div></span>
                    <span className="tabular-nums">{money(l.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="text-sm pt-2 space-y-0.5 text-right tabular-nums">
                {d.discount_pct > 0 && <>
                  <div className="text-gray-500">{t("qt.subtotal")}: {money(d.subtotal)}</div>
                  <div className="text-gray-500">{t("qt.discount")} {d.discount_pct}%: −{money(d.discount_amount)}</div>
                </>}
                <div className="font-semibold">{t("qt.colTotal")}: {money(d.total)} {d.currency}</div>
              </div>
            </section>
            {d.notes && <section><h4 className="font-semibold text-sm mb-1">{t("qt.notes")}</h4><p className="text-sm whitespace-pre-wrap text-gray-700">{d.notes}</p></section>}
            {d.internal_notes && <section className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm"><b>{t("qt.internalNotes")}:</b> {d.internal_notes}</section>}
            {d.history.length > 0 && (
              <section>
                <h4 className="font-semibold text-sm mb-2">{t("qt.history")}</h4>
                <ul className="space-y-1.5 text-sm">
                  {d.history.map((h, i) => {
                    const lead = h.changes.lead as { to?: string } | null | undefined;
                    return (
                      <li key={i} className="border-b border-gray-100 pb-1.5">
                        <span className="font-medium">{t(`qt.act_${h.action}`)}</span>
                        {h.action === "status" && h.changes.status != null && <> → {t(`qt.st_${String(h.changes.status)}`)}</>}
                        {lead?.to && <span className="text-gray-500"> · {t("qt.deal")} → {t(`leadStatuses.${lead.to}`)}</span>}
                        <span className="text-gray-400"> · {h.by} · {fmtDate(h.at, true)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RejectForm({ id, onCancel, onSaved }: { id: number; onCancel: () => void; onSaved: (lead: unknown) => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [loss, setLoss] = useState("price");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await send(`/api/quotes/${id}/status`, { status: "rejected", reject_reason: reason, loss_reason: loss });
    setBusy(false);
    if (!r.ok) { toast.error(r.j.error ?? t("common.error")); return; }
    onSaved(r.j.lead);
  }
  const cls = `${inputCls} w-full py-1.5`;
  return (
    <form onSubmit={submit} className="rounded-lg border-2 border-red-200 bg-red-50/50 p-3 grid grid-cols-2 gap-2 text-sm">
      <div className="col-span-2 font-medium">{t("qt.rejectTitle")}</div>
      <label><div className="text-gray-500 mb-1">{t("leads.lossReason")}</div>
        <select value={loss} onChange={e => setLoss(e.target.value)} className={cls}>
          {LOSS_REASONS.map(r => <option key={r} value={r}>{t(`leads.lossReasons.${r}`)}</option>)}
        </select></label>
      <label className="col-span-2"><div className="text-gray-500 mb-1">{t("qt.rejectReason")} *</div>
        <input required value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder={t("qt.rejectHint")} className={cls} /></label>
      <div className="col-span-2 flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50">{t("qt.do_rejected")}</button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

interface FormLine { item_id: string; description: string; packaging: string; qty_kg: string; price_per_kg: string }

function QuoteForm({ quote, init, lookups, defaultManager, onCancel, onSaved }: {
  quote?: Quote; init?: Partial<Quote>; lookups: Lookups; defaultManager: string; onCancel: () => void; onSaved: (id: number) => void;
}) {
  const t = useT();
  const editing = !!quote;
  const src = quote ?? init ?? {};
  const initLead = src.lead_id ? lookups.leads.find(l => l.id === src.lead_id) : undefined;
  const [f, setF] = useState(() => ({
    quote_date: src.date?.slice(0, 10) ?? iso(new Date()),
    valid_until: quote ? quote.valid_until?.slice(0, 10) ?? "" : iso(new Date(Date.now() + 14 * 86400000)),
    customer_id: src.customer_id ? String(src.customer_id) : initLead?.customer_id ? String(initLead.customer_id) : "",
    lead_id: src.lead_id ? String(src.lead_id) : "",
    client_name: quote?.client_name ?? "", contact_person: quote?.contact_person ?? initLead?.name ?? "",
    currency: quote?.currency ?? "EUR", manager: quote?.manager || initLead?.assigned_to || defaultManager,
    discount_pct: quote?.discount_pct ? String(quote.discount_pct) : "",
    delivery_terms: quote?.delivery_terms ?? "", payment_terms: quote?.payment_terms ?? "",
    notes: quote?.notes ?? "", internal_notes: quote?.internal_notes ?? "",
  }));
  const [lines, setLines] = useState<FormLine[]>(() => quote?.lines.length
    ? quote.lines.map(l => ({ item_id: l.item_id ? String(l.item_id) : "", description: l.description, packaging: l.packaging, qty_kg: String(l.qty_kg), price_per_kg: String(l.price_per_kg) }))
    : [{ item_id: "", description: "", packaging: "", qty_kg: "", price_per_kg: "" }]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const { data: hints } = useFetch<Hints>(`/api/quotes/options?currency=${f.currency}${f.customer_id ? `&customer_id=${f.customer_id}` : ""}`);
  // A lead that isn't in the open list (won/lost, or not loaded) still has to show when editing.
  const leads = lookups.leads.filter(l => !f.customer_id || !l.customer_id || String(l.customer_id) === f.customer_id);
  const subtotal = lines.reduce((a, l) => a + (num(l.qty_kg) || 0) * (num(l.price_per_kg) || 0), 0);
  const disc = Math.min(Math.max(num(f.discount_pct) || 0, 0), 100);
  const discount = Math.round(subtotal * disc) / 100;

  function pickLead(v: string) {
    const l = lookups.leads.find(x => String(x.id) === v);
    setF(x => ({ ...x, lead_id: v, customer_id: l?.customer_id ? String(l.customer_id) : x.customer_id,
                       contact_person: x.contact_person || l?.name || "", manager: l?.assigned_to || x.manager }));
  }
  function setLine(i: number, patch: Partial<FormLine>) { setLines(ls => ls.map((l, k) => k === i ? { ...l, ...patch } : l)); }
  function pickItem(i: number, v: string) {
    const item = lookups.items.find(x => String(x.id) === v);
    const h = item ? hints?.[item.id] : undefined;
    setLines(ls => ls.map((l, k) => k !== i ? l : {
      ...l, item_id: v, description: item && (!l.description || lookups.items.some(x => x.name === l.description)) ? item.name : l.description,
      price_per_kg: l.price_per_kg || (h?.customer ?? h?.any ? String((h.customer ?? h.any)!.price) : ""),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await send(editing ? `/api/quotes/${quote!.id}` : "/api/quotes", { ...f, lines }, editing ? "PUT" : "POST");
    setBusy(false);
    if (!r.ok) { toast.error(r.j.error ?? t("common.error")); return; }
    toast.success(editing ? t("qt.saved") : t("qt.created").replace("{n}", String(r.j.number)));
    onSaved(Number(r.j.id ?? quote!.id));
  }

  const cls = `${inputCls} w-full py-1.5`;
  const L = (label: string, el: React.ReactNode, span = "") => (
    <label className={span}><div className="text-gray-500 mb-1">{label}</div>{el}</label>
  );
  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {L(t("qt.customer"), (
          <select value={f.customer_id} onChange={e => setF(x => ({ ...x, customer_id: e.target.value, lead_id: "" }))} className={cls}>
            <option value="">—</option>
            {lookups.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            {quote?.customer_id && !lookups.customers.some(c => c.id === quote.customer_id) && <option value={quote.customer_id}>{quote.customer_name}</option>}
          </select>
        ), "col-span-2")}
        {L(t("qt.deal"), (
          <select value={f.lead_id} onChange={e => pickLead(e.target.value)} className={cls}>
            <option value="">{t("qt.noDeal")}</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.company ? `${l.company} · ${l.name}` : l.name} · {t(`leadStatuses.${l.status}`)}</option>)}
            {quote?.lead_id && !leads.some(l => l.id === quote.lead_id) && <option value={quote.lead_id}>{quote.lead_name}</option>}
          </select>
        ), "col-span-2")}
        {L(t("qt.clientName"), <input value={f.client_name} onChange={e => set("client_name", e.target.value)} maxLength={300} placeholder={t("qt.clientNameHint")} className={cls} />, "col-span-2")}
        {L(t("qt.contactPerson"), <input value={f.contact_person} onChange={e => set("contact_person", e.target.value)} maxLength={200} className={cls} />, "col-span-2")}
        {L(`${t("qt.colDate")} *`, <input required type="date" value={f.quote_date} onChange={e => set("quote_date", e.target.value)} className={cls} />)}
        {L(t("qt.validUntil"), <input type="date" value={f.valid_until} min={f.quote_date} onChange={e => set("valid_until", e.target.value)} className={cls} />)}
        {L(t("qt.currency"), (
          <select value={f.currency} onChange={e => set("currency", e.target.value)} className={cls}>
            {[...new Set([...CURRENCIES, f.currency])].map(c => <option key={c}>{c}</option>)}
          </select>
        ))}
        {L(t("qt.manager"), (
          <select value={f.manager} onChange={e => set("manager", e.target.value)} className={cls}>
            {lookups.users.map(u => <option key={u.username} value={u.username}>{u.name}</option>)}
          </select>
        ))}
      </div>

      <section className="space-y-2">
        <h4 className="font-semibold">{t("qt.lines")}</h4>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const h = l.item_id ? hints?.[Number(l.item_id)] : undefined;
            const amount = (num(l.qty_kg) || 0) * (num(l.price_per_kg) || 0);
            return (
              <div key={i} className="rounded-lg border border-[#dde3ef] p-2 grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                <label className="col-span-2 sm:col-span-3"><div className="text-xs text-gray-500 mb-0.5">{t("qt.item")}</div>
                  <select value={l.item_id} onChange={e => pickItem(i, e.target.value)} className={`${inputCls} w-full py-1`}>
                    <option value="">—</option>
                    {lookups.items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select></label>
                <label className="col-span-2 sm:col-span-3"><div className="text-xs text-gray-500 mb-0.5">{t("qt.description")} *</div>
                  <input required value={l.description} onChange={e => setLine(i, { description: e.target.value })} maxLength={300} placeholder={t("qt.descriptionHint")} className={`${inputCls} w-full py-1`} /></label>
                <label className="col-span-2 sm:col-span-2"><div className="text-xs text-gray-500 mb-0.5">{t("qt.packaging")}</div>
                  <input value={l.packaging} onChange={e => setLine(i, { packaging: e.target.value })} maxLength={200} placeholder={t("qt.packagingHint")} className={`${inputCls} w-full py-1`} /></label>
                <label className="sm:col-span-1"><div className="text-xs text-gray-500 mb-0.5">{t("qt.qtyKg")} *</div>
                  <input required value={l.qty_kg} onChange={e => setLine(i, { qty_kg: e.target.value })} inputMode="decimal" className={`${inputCls} w-full py-1 tabular-nums`} /></label>
                <label className="sm:col-span-2"><div className="text-xs text-gray-500 mb-0.5">{t("qt.pricePerKg")} *</div>
                  <input required value={l.price_per_kg} onChange={e => setLine(i, { price_per_kg: e.target.value })} inputMode="decimal" className={`${inputCls} w-full py-1 tabular-nums`} /></label>
                <div className="sm:col-span-1 flex items-center justify-end gap-1 pb-1">
                  <button type="button" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, k) => k !== i) : ls)} className="p-1 text-red-600 disabled:opacity-30" disabled={lines.length === 1} aria-label="remove"><X className="w-4 h-4" /></button>
                </div>
                <div className="col-span-2 sm:col-span-12 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                  <span className="flex flex-wrap gap-2">
                    {h?.customer && <button type="button" onClick={() => setLine(i, { price_per_kg: String(h.customer!.price) })} className="underline decoration-dotted hover:text-brand">{t("qt.hintCustomer")}: {price(h.customer.price)} ({fmtDate(h.customer.date)})</button>}
                    {h?.any && <button type="button" onClick={() => setLine(i, { price_per_kg: String(h.any!.price) })} className="underline decoration-dotted hover:text-brand">{t("qt.hintAny")}: {price(h.any.price)} ({fmtDate(h.any.date)})</button>}
                  </span>
                  <span className="tabular-nums font-medium text-gray-700">{money(amount)} {f.currency}</span>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setLines(ls => [...ls, { item_id: "", description: "", packaging: "", qty_kg: "", price_per_kg: "" }])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#c8d3e8] hover:bg-gray-50"><Plus className="w-4 h-4" />{t("qt.addLine")}</button>
        <div className="flex flex-wrap items-end justify-end gap-4 text-right tabular-nums">
          <label className="text-left"><div className="text-xs text-gray-500 mb-0.5">{t("qt.discount")}, %</div>
            <input value={f.discount_pct} onChange={e => set("discount_pct", e.target.value)} inputMode="decimal" className={`${inputCls} w-24 py-1`} /></label>
          <div>
            {disc > 0 && <div className="text-gray-500">{t("qt.subtotal")}: {money(subtotal)} · −{money(discount)}</div>}
            <div className="font-semibold text-base">{t("qt.colTotal")}: {money(subtotal - discount)} {f.currency}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {L(t("qt.deliveryTerms"), <input value={f.delivery_terms} onChange={e => set("delivery_terms", e.target.value)} maxLength={300} placeholder={t("qt.deliveryHint")} className={cls} />)}
        {L(t("qt.paymentTerms"), <input value={f.payment_terms} onChange={e => set("payment_terms", e.target.value)} maxLength={300} placeholder={t("qt.paymentHint")} className={cls} />)}
        {L(t("qt.notes"), <textarea rows={3} value={f.notes} onChange={e => set("notes", e.target.value)} maxLength={2000} placeholder={t("qt.notesHint")} className={cls} />)}
        {L(t("qt.internalNotes"), <textarea rows={3} value={f.internal_notes} onChange={e => set("internal_notes", e.target.value)} maxLength={1000} placeholder={t("qt.internalHint")} className={cls} />)}
      </div>

      <div className="flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? t("common.saving") : t("common.save")}</button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}
