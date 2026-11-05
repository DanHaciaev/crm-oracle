"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Printer, Stamp } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { fmtDate, fmtKg, inputCls, useFetch } from "@/components/warehouse/shared";

interface Decl {
  id: number; number: string; date: string | null; customs_kg: number | null; country: string; customs_code: string; status: string;
  notes: string; transport: string; port: string; phyto_number: string; phyto_date: string | null; sales_id: number | null;
  sale_number: string; sale_date: string | null; net_kg: number | null; customer_id: number | null; customer_name: string;
}
interface Data { rows: Decl[]; export_without_decl: number }

// Export declarations from DIPP FRUICT (Vânzări → «Декларации») — read-only;
// each one prints from its sale.
export default function ExportDeclsPage() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams();
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<Data>(`/api/export-decls?${sp.toString()}`);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Stamp className="w-6 h-6 text-brand" />{t("ed.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("ed.subtitle")}</p>
      </div>
      {data && data.export_without_decl > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("ed.withoutDecl").replace("{n}", String(data.export_without_decl))}</span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("ed.search")} className={`${inputCls} w-full sm:w-64`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("ed.colNumber")}</TableHead>
              <TableHead>{t("ed.colDate")}</TableHead>
              <TableHead>{t("ed.colSale")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("ed.colCountry")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("ed.colTransport")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("ed.colPhyto")}</TableHead>
              <TableHead className="text-right">{t("ed.colWeight")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("ed.empty")}</TableCell></TableRow>
            ) : data.rows.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-sm whitespace-nowrap">{d.number || "—"}<div className="text-xs text-gray-400 font-sans">{t(`ed.st_${d.status}`)}</div></TableCell>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(d.date)}</TableCell>
                <TableCell className="text-sm">
                  {d.sale_number ? <Link href={`/sales?q=${encodeURIComponent(d.sale_number)}`} className="font-mono text-brand hover:underline">{d.sale_number}</Link> : "—"}
                  <div className="text-xs text-gray-500">{d.customer_name}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{d.country || "—"}{d.customs_code && <div className="text-xs text-gray-400">{d.customs_code}</div>}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{d.transport || "—"}{d.port && <div className="text-xs text-gray-400">{d.port}</div>}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{d.phyto_number || "—"}{d.phyto_date && <div className="text-xs text-gray-400">{fmtDate(d.phyto_date)}</div>}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(d.customs_kg ?? d.net_kg)}</TableCell>
                <TableCell>
                  {d.sales_id && (
                    <Link href={`/documents/print/export_decl?id=${d.sales_id}`} target="_blank" title={t("ed.print")}
                          className="inline-flex p-1.5 rounded hover:bg-gray-100 text-gray-500"><Printer className="w-4 h-4" /></Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
