"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Info } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

const STATUSES = ["draft", "approved", "in_progress", "fulfilled", "cancelled"] as const;

interface Req {
  id: number; number: string; date: string | null; expected_date: string | null; status: string; notes: string;
  created_by: string; approved_by: string; approved_at: string | null; supplier_id: number | null; supplier_name: string;
  warehouse: string; profile: string; expected_kg: number; actual_kg: number; lines: number;
}
interface List { rows: Req[]; totals: { count: number; open: number; fulfilled: number; expected_kg: number; actual_kg: number } }
interface Line { id: number; item: string; variety: string; expected_kg: number | null; actual_kg: number | null; price_limit: number | null; notes: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (v: number | null) => (v == null ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const cls: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 border-gray-200", approved: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200", fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-gray-100 text-gray-400 border-gray-200",
  };
  return <span className={`px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${cls[status] ?? cls.draft}`}>{t(`fr.st_${status}`)}</span>;
}

// Field requests from DIPP FRUICT (Recepție → «Cereri») — read-only.
export default function FieldRequestsPage() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [open, setOpen] = useState<Req | null>(null);
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (status) sp.set("status", status);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<List>(`/api/field-requests?${sp.toString()}`);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-brand" />{t("fr.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("fr.subtitle")}</p>
      </div>
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile label={t("fr.open")} value={String(data.totals.open)} hint={`${t("fr.total")}: ${data.totals.count}`} />
          <StatTile label={t("fr.st_fulfilled")} value={String(data.totals.fulfilled)} />
          <StatTile label={t("fr.expected")} value={fmtKg(data.totals.expected_kg)} unit={t("warehouse.kg")} />
          <StatTile label={t("fr.actual")} value={fmtKg(data.totals.actual_kg)} unit={t("warehouse.kg")} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={status} onChange={setStatus} all={t("warehouse.allStatuses")} options={STATUSES.map(s => ({ value: s, label: t(`fr.st_${s}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("fr.search")} className={`${inputCls} w-full sm:w-64`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("fr.colNumber")}</TableHead>
              <TableHead>{t("fr.colDate")}</TableHead>
              <TableHead>{t("fr.colSupplier")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("fr.colExpectedDate")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("fr.colWarehouse")}</TableHead>
              <TableHead className="text-right">{t("fr.expected")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("fr.actual")}</TableHead>
              <TableHead>{t("fr.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("fr.empty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                <TableCell className="font-mono text-sm text-brand whitespace-nowrap">{r.number}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="text-sm">{r.supplier_name || "—"}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{fmtDate(r.expected_date)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{r.warehouse || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(r.expected_kg)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{fmtKg(r.actual_kg)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RequestSheet req={open} lang={lang} onClose={() => setOpen(null)} />
    </div>
  );
}

function RequestSheet({ req, lang, onClose }: { req: Req | null; lang: string; onClose: () => void }) {
  const t = useT();
  const { data, error } = useFetch<Line[]>(req ? `/api/field-requests/${req.id}?lang=${lang}` : null);
  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
      <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
    </div>
  );
  return (
    <Sheet open={req != null} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle className="font-mono">{req?.number ?? "…"}</SheetTitle></SheetHeader>
        {req && (
          <div className="px-4 pb-6 space-y-5">
            <StatusBadge status={req.status} />
            <div>
              {kv(t("fr.colSupplier"), req.supplier_id ? <Link href={`/suppliers/${req.supplier_id}`} className="text-brand hover:underline">{req.supplier_name}</Link> : "—")}
              {kv(t("fr.colDate"), fmtDate(req.date))}
              {kv(t("fr.colExpectedDate"), fmtDate(req.expected_date))}
              {kv(t("fr.colWarehouse"), req.warehouse || "—")}
              {kv(t("fr.profile"), req.profile || "—")}
              {kv(t("fr.createdBy"), req.created_by || "—")}
              {req.approved_by && kv(t("fr.approvedBy"), `${req.approved_by} · ${fmtDate(req.approved_at, true)}`)}
              {req.notes && kv(t("common.notes"), req.notes)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-2">{t("fr.lines")}</h4>
              {error && <div className="text-sm text-red-600">{error}</div>}
              {!data && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
              {data?.map(l => (
                <div key={l.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5">
                  <span>{l.item}{l.variety && <span className="text-gray-500"> · {l.variety}</span>}
                    {l.price_limit != null && <div className="text-xs text-gray-400">{t("fr.priceLimit")}: {money(l.price_limit)}</div>}
                    {l.notes && <div className="text-xs text-gray-500">{l.notes}</div>}</span>
                  <span className="tabular-nums text-right">{fmtKg(l.expected_kg)} {t("warehouse.kg")}
                    <div className="text-xs text-gray-500">{t("fr.actual")}: {fmtKg(l.actual_kg)}</div></span>
                </div>
              ))}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
