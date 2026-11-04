"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Info, Printer, Undo2 } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useUrlParam } from "@/hooks/useUrlParam";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

interface Ret {
  id: number; return_number: string; return_date: string | null; reason: string; created_by: string; status: string;
  cancelled_by: string; cancelled_at: string | null; sales_id: number | null; sale_number: string; sale_date: string | null;
  currency_code: string; customer_id: number | null; customer_name: string; qty_kg: number; amount: number; amount_mdl: number; items: string;
}
interface List { rows: Ret[]; totals: { count: number; qty_kg: number; amount_mdl: number; cancelled: number; customers: number } }
interface Detail {
  id: number; return_number: string; return_date: string | null; reason: string; created_by: string; status: string;
  cancelled_by: string; cancelled_at: string | null; cancelled_qty_kg: number | null; sales_id: number | null;
  sale_number: string; sale_date: string | null; currency_code: string; warehouse_name: string;
  customer_id: number | null; customer_name: string;
  lines: { id: number; item_name: string; batch_id: number | null; batch_number: string; qty_kg: number; amount: number; price_per_kg: number; sold_kg: number }[];
  total_qty_kg: number; total_amount: number;
}

const money = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return status === "cancelled"
    ? <span className="px-2 py-0.5 rounded-full border text-xs bg-gray-100 text-gray-500 border-gray-200">{t("returns.status_cancelled")}</span>
    : <span className="px-2 py-0.5 rounded-full border text-xs bg-orange-50 text-orange-700 border-orange-200">{t("returns.status_active")}</span>;
}

// Customer returns — read-only: returns are created/cancelled in DIPP FRUICT
// (that's where the kg go back onto the batch).
export default function ReturnsPage() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo]     = useState(iso(today));
  const [customer, setCustomer] = useState("");
  const [status, setStatus]     = useState("");
  const [q, setQ]               = useState("");
  const [qd, setQd]             = useState("");
  const [open, setOpen]         = useState<number | null>(null);
  useUrlParam("q", v => { setQ(v); setQd(v); setDateFrom(""); });
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);

  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (customer) sp.set("customer_id", customer);
  if (status) sp.set("status", status);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<List>(`/api/returns?${sp.toString()}`);
  const customers = [...new Map((data?.rows ?? []).filter(r => r.customer_id).map(r => [r.customer_id, r.customer_name])).entries()];
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const xlsx = new URLSearchParams({ format: "xlsx", lang });
  if (dateFrom) xlsx.set("date_from", dateFrom);
  if (dateTo) xlsx.set("date_to", dateTo);
  if (customer) xlsx.set("customer_id", customer);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Undo2 className="w-6 h-6 text-brand" />{t("returns.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("returns.subtitle")}</p>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile label={t("returns.count")} value={String(data.totals.count)} hint={data.totals.cancelled ? `${t("returns.cancelledCount")}: ${data.totals.cancelled}` : undefined} />
          <StatTile label={t("returns.qty")} value={fmtKg(data.totals.qty_kg)} unit={t("warehouse.kg")} />
          <StatTile label={t("returns.amount")} value={money(data.totals.amount_mdl)} unit="MDL" />
          <StatTile label={t("returns.customers")} value={String(data.totals.customers)} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={customer} onChange={setCustomer} all={t("profit.allCustomers")} options={customers.map(([id, name]) => ({ value: id!, label: name }))} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")}
                options={["active", "cancelled"].map(s => ({ value: s, label: t(`returns.status_${s}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("returns.search")} className={`${inputCls} w-full sm:w-64`} />
        <a href={`${BASE}/api/reports/returns?${xlsx.toString()}`}
           className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition">
          <FileSpreadsheet className="w-4 h-4" />Excel
        </a>
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("returns.colNumber")}</TableHead>
              <TableHead>{t("returns.colDate")}</TableHead>
              <TableHead>{t("returns.colCustomer")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("returns.colSale")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("returns.colItems")}</TableHead>
              <TableHead className="text-right">{t("returns.colQty")}</TableHead>
              <TableHead className="text-right hidden sm:table-cell">{t("returns.colAmount")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("returns.colReason")}</TableHead>
              <TableHead>{t("returns.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={9} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-6">{t("returns.empty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id} className={`cursor-pointer ${r.status === "cancelled" ? "opacity-60" : ""}`} onClick={() => setOpen(r.id)}>
                <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{r.return_number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.return_date)}</TableCell>
                <TableCell className="text-sm">{r.customer_name || "—"}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-sm">{r.sale_number || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{r.items || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(r.qty_kg, 1)}</TableCell>
                <TableCell className="text-right tabular-nums hidden sm:table-cell">{money(r.amount)} {r.currency_code}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600">{r.reason || "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReturnSheet id={open} lang={lang} onClose={() => setOpen(null)} />
    </div>
  );
}

function ReturnSheet({ id, lang, onClose }: { id: number | null; lang: string; onClose: () => void }) {
  const t = useT();
  const { data, error } = useFetch<Detail>(id ? `/api/returns/${id}?lang=${lang}` : null);
  const d = data && data.id === id ? data : null;
  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
      <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
    </div>
  );
  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle className="font-mono">{d?.return_number ?? "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={d.status} />
              <Link href={`/documents/print/return_act?id=${d.id}`} target="_blank"
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
                <Printer className="w-4 h-4" />{t("returns.printAct")}
              </Link>
            </div>
            <div>
              {kv(t("returns.colDate"), fmtDate(d.return_date, true))}
              {kv(t("returns.colCustomer"), d.customer_id ? <Link href={`/customers/${d.customer_id}`} className="text-brand hover:underline">{d.customer_name}</Link> : "—")}
              {kv(t("returns.colSale"), d.sale_number ? <Link href={`/sales?q=${encodeURIComponent(d.sale_number)}`} className="text-brand hover:underline">{d.sale_number} · {fmtDate(d.sale_date)}</Link> : "—")}
              {kv(t("warehouse.colWarehouse"), d.warehouse_name || "—")}
              {kv(t("returns.colReason"), d.reason || "—")}
              {kv(t("returns.createdBy"), d.created_by || "—")}
              {d.status === "cancelled" && kv(t("returns.cancelledBy"), `${d.cancelled_by || "—"} · ${fmtDate(d.cancelled_at, true)}`)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-2">{t("returns.lines")}</h4>
              <div className="space-y-1">
                {d.lines.map(l => (
                  <div key={l.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5">
                    <span>
                      {l.item_name}
                      {l.batch_id && <> · <Link href={`/warehouse?batch=${l.batch_id}`} className="font-mono text-brand hover:underline">{l.batch_number}</Link></>}
                      <div className="text-xs text-gray-400">{t("returns.ofSold").replace("{sold}", fmtKg(l.sold_kg, 1))}</div>
                    </span>
                    <span className="tabular-nums text-right">{fmtKg(l.qty_kg, 1)} {t("warehouse.kg")}<div className="text-xs text-gray-500">{money(l.amount)} {d.currency_code}</div></span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-semibold pt-2">
                <span>{t("returns.total")}</span>
                <span className="tabular-nums">{fmtKg(d.total_qty_kg, 1)} {t("warehouse.kg")} · {money(d.total_amount)} {d.currency_code}</span>
              </div>
            </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
