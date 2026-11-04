"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, Clock, FileSpreadsheet, Info, Plus, Printer, Wallet } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { useUrlParam } from "@/hooks/useUrlParam";
import { Bar, StatTile, fmtDate, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

const AGING = ["not_due", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
const METHODS = ["bank", "cash", "card", "offset", "other"] as const;
type Aging = (typeof AGING)[number];

interface SumRow {
  customer_id: number; customer_name: string; currency: string; billed: number; returned: number; paid: number;
  balance: number; balance_mdl: number | null; overdue: number; overdue_mdl: number | null; credit: number;
  aging: Record<Aging, number>; open_docs: number; oldest_overdue_days: number; last_payment: string | null;
  payment_days: number; credit_limit_mdl: number | null; over_limit: boolean;
}
interface Summary {
  rows: SumRow[]; default_payment_days: number;
  totals: { balance_mdl: number; overdue_mdl: number; aging_mdl: Record<Aging, number>; debtors: number; overdue_customers: number; paid_mdl: number };
}
interface Pay {
  id: number; number: string; date: string | null; amount: number; currency: string; amount_mdl: number | null; method: string;
  reference: string; notes: string; status: string; created_by: string; cancelled_by: string; cancelled_at: string | null;
  cancel_reason: string; customer_id: number; customer_name: string; sales_id: number | null; sale_number: string;
}
interface Ledger {
  customer: { id: number; name: string; tax_id: string; address: string };
  terms: { payment_days: number | null; credit_limit_mdl: number | null; default_days: number };
  docs: { id: number; number: string; date: string; currency: string; total: number; returned: number; paid: number; remaining: number; due_date: string; days_overdue: number; status: string }[];
  payments: (Omit<Pay, "customer_name" | "customer_id" | "sale_number" | "sales_id"> & { sales_doc_id: number | null })[];
  credit: Record<string, number>;
}

const money = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DocStatus({ status, days }: { status: string; days: number }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    paid:    { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    partial: { cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
    unpaid:  { cls: "bg-gray-100 text-gray-600 border-gray-200", Icon: Clock },
    overdue: { cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertTriangle },
  };
  const c = cfg[status] ?? cfg.unpaid;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`recv.st_${status}`)}{status === "overdue" && ` ${days} ${t("warehouse.days")}`}
    </span>
  );
}

// Customer receivables & payments. Sales and returns come from DIPP FRUICT;
// payments live in the CRM (AGRO_CRM_PAYMENTS).
export default function ReceivablesPage() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "payments", "edit");
  const [tab, setTab] = useState<"debts" | "payments">("debts");
  const [open, setOpen] = useState<number | null>(null);
  const [onlyDebt, setOnlyDebt] = useState(true);
  const [q, setQ] = useState("");
  const { data, error, reload } = useFetch<Summary>("/api/receivables");
  useUrlParam("customer", v => { if (Number(v) > 0) setOpen(Number(v)); });
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const rows = (data?.rows ?? []).filter(r => (!onlyDebt || r.balance > 0.005) && (!q || r.customer_name.toLowerCase().includes(q.toLowerCase())));
  const maxAging = Math.max(...AGING.map(a => data?.totals.aging_mdl[a] ?? 0), 1);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-brand" />{t("recv.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("recv.subtitle")}</p>
      </div>

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
            <StatTile label={t("recv.totalDebt")} value={money0(data.totals.balance_mdl)} unit="MDL" hint={`${data.totals.debtors} ${t("recv.debtors")}`} />
            <StatTile label={t("recv.overdue")} value={money0(data.totals.overdue_mdl)} unit="MDL" hint={`${data.totals.overdue_customers} ${t("recv.debtors")}`} tone={data.totals.overdue_mdl > 0 ? "bad" : undefined} />
            <StatTile label={t("recv.paidTotal")} value={money0(data.totals.paid_mdl)} unit="MDL" />
            <StatTile label={t("recv.defaultTerm")} value={String(data.default_payment_days)} unit={t("warehouse.days")} hint={canEdit ? t("recv.changeInTab") : undefined} />
          </div>
          {data.totals.paid_mdl === 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("recv.noPaymentsYet")}</span>
            </div>
          )}
        </>
      )}

      <div className="flex gap-1 mb-4 border-b border-[#dde3ef]">
        {(["debts", "payments"] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`recv.tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "debts" ? (
        <div className="space-y-4">
          {data && (
            <section className="border border-[#c8d3e8] rounded-xl p-4">
              <h3 className="font-semibold mb-1">{t("recv.agingTitle")}</h3>
              <p className="text-xs text-gray-400 mb-3">{t("recv.agingHint")}</p>
              {AGING.map(a => (
                <Bar key={a} label={t(`recv.ag_${a}`)} value={data.totals.aging_mdl[a]} max={maxAging} valueLabel={`${money0(data.totals.aging_mdl[a])} MDL`} />
              ))}
            </section>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("recv.searchCustomer")} className={`${inputCls} w-full sm:w-64`} />
            <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
              <input type="checkbox" checked={onlyDebt} onChange={e => setOnlyDebt(e.target.checked)} />{t("recv.onlyDebt")}
            </label>
            {canEdit && data && <DefaultDays key={data.default_payment_days} value={data.default_payment_days} onSaved={reload} />}
            <a href={`${BASE}/api/reports/receivables?format=xlsx`} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50">
              <FileSpreadsheet className="w-4 h-4" />Excel
            </a>
          </div>
          <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>{t("recv.colCustomer")}</TableHead>
                  <TableHead className="text-right">{t("recv.colBalance")}</TableHead>
                  <TableHead className="text-right">{t("recv.colOverdue")}</TableHead>
                  {AGING.slice(1).map(a => <TableHead key={a} className="text-right hidden xl:table-cell whitespace-nowrap">{t(`recv.ag_${a}`)}</TableHead>)}
                  <TableHead className="text-right hidden md:table-cell">{t("recv.colDocs")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("recv.colLastPayment")}</TableHead>
                  <TableHead className="text-right hidden md:table-cell">{t("recv.colTerm")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {error ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
                ) : !data ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-gray-400 py-6">{t("recv.noDebts")}</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow key={`${r.customer_id}-${r.currency}`} className="cursor-pointer" onClick={() => setOpen(r.customer_id)}>
                    <TableCell>
                      <span className="text-brand">{r.customer_name}</span>
                      {r.over_limit && <span className="ml-2 text-xs text-red-600 inline-flex items-center gap-0.5"><Ban className="w-3 h-3" />{t("recv.overLimit")}</span>}
                      {r.credit > 0 && <div className="text-xs text-emerald-700">{t("recv.credit")}: {money(r.credit)} {r.currency}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{money(r.balance)} {r.currency}
                      {r.currency !== "MDL" && r.balance_mdl != null && <div className="text-xs text-gray-400">≈ {money0(r.balance_mdl)} MDL</div>}</TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap ${r.overdue > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>{r.overdue > 0 ? money(r.overdue) : "—"}</TableCell>
                    {AGING.slice(1).map(a => <TableCell key={a} className="text-right tabular-nums hidden xl:table-cell">{r.aging[a] > 0 ? money0(r.aging[a]) : "—"}</TableCell>)}
                    <TableCell className="text-right tabular-nums hidden md:table-cell">{r.open_docs}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{fmtDate(r.last_payment)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">{r.payment_days}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <PaymentsJournal onOpenCustomer={setOpen} canEdit={canEdit} />
      )}

      <CustomerSheet id={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

function DefaultDays({ value, onSaved }: { value: number; onSaved: () => void }) {
  const t = useT();
  const [v, setV] = useState(String(value));
  async function save() {
    const res = await fetch("/api/receivables/default-days", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: Number(v) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("recv.saved")); onSaved();
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-gray-600">
      {t("recv.defaultTerm")}:
      <input value={v} onChange={e => setV(e.target.value)} inputMode="numeric" className={`${inputCls} w-16 py-1`} />
      {v !== String(value) && <button onClick={save} className="px-2 py-1 rounded-md bg-brand text-white text-xs">{t("common.save")}</button>}
    </span>
  );
}

function PaymentsJournal({ onOpenCustomer, canEdit }: { onOpenCustomer: (id: number) => void; canEdit: boolean }) {
  const t = useT();
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(today));
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams({ date_from: from, date_to: to });
  if (qd) sp.set("q", qd);
  const { data, error, reload } = useFetch<Pay[]>(`/api/payments?${sp.toString()}`);
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("recv.searchPayment")} className={`${inputCls} w-full sm:w-64`} />
        <a href={`${BASE}/api/reports/payments?format=xlsx&date_from=${from}&date_to=${to}`} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50">
          <FileSpreadsheet className="w-4 h-4" />Excel
        </a>
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("recv.colPayment")}</TableHead><TableHead>{t("recv.colDate")}</TableHead><TableHead>{t("recv.colCustomer")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("recv.colForDoc")}</TableHead><TableHead className="text-right">{t("recv.colAmount")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("recv.colMethod")}</TableHead><TableHead className="hidden lg:table-cell">{t("recv.colReference")}</TableHead>
              <TableHead>{t("recv.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("recv.noPayments")}</TableCell></TableRow>
            ) : data.map(p => (
              <TableRow key={p.id} className={p.status === "cancelled" ? "opacity-50" : ""}>
                <TableCell className="font-mono text-sm whitespace-nowrap">{p.number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(p.date)}</TableCell>
                <TableCell><button onClick={() => onOpenCustomer(p.customer_id)} className="text-brand hover:underline text-sm">{p.customer_name}</button></TableCell>
                <TableCell className="hidden md:table-cell font-mono text-sm">{p.sale_number || t("recv.onAccount")}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{money(p.amount)} {p.currency}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{t(`recv.m_${p.method}`)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600">{p.reference || "—"}</TableCell>
                <TableCell className="text-sm">
                  {p.status === "cancelled"
                    ? <span title={`${p.cancelled_by}: ${p.cancel_reason}`} className="text-gray-500">{t("recv.cancelled")}</span>
                    : canEdit ? <CancelButton id={p.id} onDone={reload} /> : <span className="text-emerald-700">{t("recv.active")}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CancelButton({ id, onDone }: { id: number; onDone: () => void }) {
  const t = useT();
  async function cancel() {
    const reason = window.prompt(t("recv.cancelReason"));
    if (!reason?.trim()) return;
    const res = await fetch(`/api/payments/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("recv.cancelledOk")); onDone();
  }
  return <button onClick={cancel} className="text-xs text-gray-400 hover:text-red-600 underline">{t("recv.cancel")}</button>;
}

function CustomerSheet({ id, canEdit, onClose, onChanged }: { id: number | null; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const lang = useLang();
  const { data, error, reload } = useFetch<Ledger>(id ? `/api/receivables/${id}` : null);
  const d = data && data.customer.id === id ? data : null;
  const [payFor, setPayFor] = useState<{ docId: number | null; currency: string; amount: number } | null>(null);
  const today = new Date();
  const [recFrom, setRecFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [recTo, setRecTo] = useState(iso(today));
  const currencies = d ? [...new Set(d.docs.map(x => x.currency))] : [];
  const [recCur, setRecCur] = useState("");
  const refresh = () => { reload(); onChanged(); };

  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) { onClose(); setPayFor(null); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle>{d?.customer.name ?? "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex flex-wrap gap-2">
              <Link href={`/customers/${d.customer.id}`} className="text-sm text-brand hover:underline">{t("recv.openCustomer")}</Link>
              {canEdit && (
                <button onClick={() => setPayFor({ docId: null, currency: currencies[0] ?? "MDL", amount: 0 })}
                        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-sm">
                  <Plus className="w-4 h-4" />{t("recv.addPayment")}
                </button>
              )}
            </div>

            {payFor && <PaymentForm customerId={d.customer.id} docs={d.docs} init={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); refresh(); }} />}

            {Object.keys(d.credit).length > 0 && (
              <div className="text-sm text-emerald-700">{t("recv.credit")}: {Object.entries(d.credit).map(([c, v]) => `${money(v)} ${c}`).join(", ")}</div>
            )}

            <Terms key={`${d.customer.id}-${d.terms.payment_days}-${d.terms.credit_limit_mdl}`} customerId={d.customer.id} terms={d.terms} canEdit={canEdit} onSaved={refresh} />

            <section className="rounded-lg border border-[#dde3ef] p-3">
              <div className="text-sm font-medium mb-2">{t("recv.reconciliation")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={recFrom} onChange={e => setRecFrom(e.target.value)} className={`${inputCls} py-1`} />
                <input type="date" value={recTo} onChange={e => setRecTo(e.target.value)} className={`${inputCls} py-1`} />
                <select value={recCur || currencies[0] || "MDL"} onChange={e => setRecCur(e.target.value)} className={`${inputCls} py-1`}>
                  {(currencies.length ? currencies : ["MDL"]).map(c => <option key={c}>{c}</option>)}
                </select>
                <Link target="_blank" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50"
                      href={`/documents/print/reconciliation_act?customer_id=${d.customer.id}&currency=${recCur || currencies[0] || "MDL"}&date_from=${recFrom}&date_to=${recTo}&lang=${lang}`}>
                  <Printer className="w-4 h-4" />{t("recv.print")}
                </Link>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-2">{t("recv.docsTitle")}</h4>
              <div className="border border-[#dde3ef] rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("recv.colDoc")}</TableHead><TableHead className="text-right">{t("recv.colTotal")}</TableHead>
                      <TableHead className="text-right">{t("recv.colPaid")}</TableHead><TableHead className="text-right">{t("recv.colLeft")}</TableHead>
                      <TableHead>{t("recv.colDue")}</TableHead><TableHead>{t("recv.colStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.docs.map(x => (
                      <TableRow key={x.id}>
                        <TableCell className="text-sm"><span className="font-mono">{x.number}</span><div className="text-xs text-gray-400">{fmtDate(x.date)}</div></TableCell>
                        <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">{money(x.total)} {x.currency}
                          {x.returned > 0 && <div className="text-xs text-orange-600">−{money(x.returned)}</div>}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{x.paid > 0 ? money(x.paid) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{x.remaining > 0 ? money(x.remaining) : "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(x.due_date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <DocStatus status={x.status} days={x.days_overdue} />
                            {canEdit && x.remaining > 0 && (
                              <button onClick={() => setPayFor({ docId: x.id, currency: x.currency, amount: x.remaining })} className="text-xs text-brand hover:underline whitespace-nowrap">
                                {t("recv.pay")}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {d.docs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-4">{t("recv.noDocs")}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-2">{t("recv.paymentsTitle")}</h4>
              {d.payments.length === 0 ? <div className="text-sm text-gray-400">{t("recv.noPayments")}</div> : (
                <div className="space-y-1">
                  {d.payments.map(p => (
                    <div key={p.id} className={`flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5 ${p.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                      <span><span className="font-mono">{p.number}</span> · {fmtDate(p.date)} · {t(`recv.m_${p.method}`)}{p.reference && ` · ${p.reference}`}
                        <div className="text-xs text-gray-400">{p.sales_doc_id ? d.docs.find(x => x.id === p.sales_doc_id)?.number ?? "" : t("recv.onAccount")}{p.status === "cancelled" && ` · ${p.cancel_reason}`}</div></span>
                      <span className="tabular-nums text-right whitespace-nowrap">{money(p.amount)} {p.currency}
                        {canEdit && p.status === "active" && <div><CancelButton id={p.id} onDone={refresh} /></div>}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Terms({ customerId, terms, canEdit, onSaved }: { customerId: number; terms: Ledger["terms"]; canEdit: boolean; onSaved: () => void }) {
  const t = useT();
  const [days, setDays] = useState(terms.payment_days != null ? String(terms.payment_days) : "");
  const [limit, setLimit] = useState(terms.credit_limit_mdl != null ? String(terms.credit_limit_mdl) : "");
  async function save() {
    const res = await fetch(`/api/receivables/${customerId}/terms`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_days: days, credit_limit_mdl: limit }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("recv.saved")); onSaved();
  }
  return (
    <section className="rounded-lg border border-[#dde3ef] p-3 flex flex-wrap items-end gap-3 text-sm">
      <label><div className="text-gray-500 mb-1">{t("recv.termDays")}</div>
        <input value={days} onChange={e => setDays(e.target.value)} disabled={!canEdit} placeholder={`${terms.default_days} (${t("recv.byDefault")})`} inputMode="numeric" className={`${inputCls} w-40 py-1`} /></label>
      <label><div className="text-gray-500 mb-1">{t("recv.creditLimit")}</div>
        <input value={limit} onChange={e => setLimit(e.target.value)} disabled={!canEdit} placeholder={t("recv.noLimit")} inputMode="decimal" className={`${inputCls} w-40 py-1`} /></label>
      {canEdit && <button onClick={save} className="px-3 py-1.5 rounded-lg border border-[#dde3ef] hover:bg-gray-50">{t("common.save")}</button>}
    </section>
  );
}

function PaymentForm({ customerId, docs, init, onClose, onSaved }: {
  customerId: number; docs: Ledger["docs"]; init: { docId: number | null; currency: string; amount: number };
  onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [docId, setDocId] = useState(init.docId ? String(init.docId) : "");
  const [currency, setCurrency] = useState(init.currency);
  const [amount, setAmount] = useState(init.amount ? init.amount.toFixed(2) : "");
  const [date, setDate] = useState(iso(new Date()));
  const [method, setMethod] = useState<string>("bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const currencies = [...new Set(docs.map(x => x.currency))];
  const openDocs = docs.filter(x => x.remaining > 0);

  function pickDoc(v: string) {
    setDocId(v);
    const doc = docs.find(x => String(x.id) === v);
    if (doc) { setCurrency(doc.currency); setAmount(doc.remaining.toFixed(2)); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, sales_doc_id: docId || null, pay_date: date, amount, currency, method, reference, notes }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("recv.paymentSaved").replace("{n}", j.number)); onSaved();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3 grid grid-cols-2 gap-2 text-sm">
      <div className="col-span-2 font-medium">{t("recv.newPayment")}</div>
      <label className="col-span-2"><div className="text-gray-500 mb-1">{t("recv.forDoc")}</div>
        <select value={docId} onChange={e => pickDoc(e.target.value)} className={`${inputCls} w-full py-1`}>
          <option value="">{t("recv.onAccountFifo")}</option>
          {openDocs.map(x => <option key={x.id} value={x.id}>{x.number} · {fmtDate(x.date)} · {money(x.remaining)} {x.currency}</option>)}
        </select></label>
      <label><div className="text-gray-500 mb-1">{t("recv.colAmount")} *</div>
        <input required value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={`${inputCls} w-full py-1 tabular-nums`} /></label>
      <label><div className="text-gray-500 mb-1">{t("recv.currency")}</div>
        <select value={currency} disabled={!!docId} onChange={e => setCurrency(e.target.value)} className={`${inputCls} w-full py-1`}>
          {(currencies.length ? currencies : ["MDL"]).map(c => <option key={c}>{c}</option>)}
        </select></label>
      <label><div className="text-gray-500 mb-1">{t("recv.colDate")} *</div>
        <input required type="date" value={date} max={iso(new Date())} onChange={e => setDate(e.target.value)} className={`${inputCls} w-full py-1`} /></label>
      <label><div className="text-gray-500 mb-1">{t("recv.colMethod")}</div>
        <select value={method} onChange={e => setMethod(e.target.value)} className={`${inputCls} w-full py-1`}>
          {METHODS.map(m => <option key={m} value={m}>{t(`recv.m_${m}`)}</option>)}
        </select></label>
      <label className="col-span-2"><div className="text-gray-500 mb-1">{t("recv.colReference")}</div>
        <input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder={t("recv.referenceHint")} className={`${inputCls} w-full py-1`} /></label>
      <label className="col-span-2"><div className="text-gray-500 mb-1">{t("recv.notes")}</div>
        <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} className={`${inputCls} w-full py-1`} /></label>
      <div className="col-span-2 flex gap-2">
        <button disabled={busy} className="px-4 py-1.5 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? t("common.saving") : t("recv.save")}</button>
        <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg border border-[#dde3ef]">{t("common.cancel")}</button>
      </div>
    </form>
  );
}
