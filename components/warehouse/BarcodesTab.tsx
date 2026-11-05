"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, type Lang } from "./shared";

interface Barcode {
  id: number; barcode: string; type: string; generated_at: string | null; printed: boolean; assigned: boolean;
  batch_id: number | null; batch_number: string;
  crate: { id: number; external_barcode: string; status: string; packaging: string; gross_kg: number | null; tare_kg: number | null; net_kg: number | null } | null;
}
interface Data { rows: Barcode[]; totals: { count: number; printed: number; assigned: number; crates: number } }

// Barcodes / crates from DIPP FRUICT («Coduri bare») — list only; labels
// are generated and printed in DIPP FRUICT.
export function BarcodesTab({ lang, onOpenBatch }: { lang: Lang; onOpenBatch: (id: number) => void }) {
  const t = useT();
  const [type, setType] = useState("");
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  const sp = new URLSearchParams({ lang });
  if (type) sp.set("type", type);
  if (state) sp.set("state", state);
  if (qd) sp.set("q", qd);
  const { data, error } = useFetch<Data>(`/api/warehouse/barcodes?${sp.toString()}`);
  const yes = (v: boolean) => (v ? t("dirs.yes") : <span className="text-gray-400">{t("dirs.no")}</span>);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("warehouse.barcodesNote")}</span>
      </div>
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("warehouse.bcTotal")} value={String(data.totals.count)} />
          <StatTile label={t("warehouse.bcPrinted")} value={String(data.totals.printed)} />
          <StatTile label={t("warehouse.bcAssigned")} value={String(data.totals.assigned)} />
          <StatTile label={t("warehouse.bcCrates")} value={String(data.totals.crates)} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={type} onChange={setType} all={t("warehouse.bcAllTypes")}
                options={["internal", "external", "qr"].map(v => ({ value: v, label: t(`warehouse.bct_${v}`) }))} />
        <Select value={state} onChange={setState} all={t("warehouse.allStatuses")}
                options={["free", "assigned", "unprinted"].map(v => ({ value: v, label: t(`warehouse.bcs_${v}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("warehouse.bcSearch")} className={`${inputCls} w-full sm:w-64`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("warehouse.bcCode")}</TableHead>
              <TableHead>{t("warehouse.bcType")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.bcGenerated")}</TableHead>
              <TableHead>{t("warehouse.bcPrinted")}</TableHead>
              <TableHead>{t("warehouse.bcAssigned")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("warehouse.bcCrate")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("warehouse.colBatch")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("warehouse.bcEmpty")}</TableCell></TableRow>
            ) : data.rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm whitespace-nowrap">{r.barcode}{r.crate?.external_barcode && <div className="text-xs text-gray-400">{r.crate.external_barcode}</div>}</TableCell>
                <TableCell className="text-sm">{t(`warehouse.bct_${r.type}`)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm whitespace-nowrap">{fmtDate(r.generated_at, true)}</TableCell>
                <TableCell className="text-sm">{yes(r.printed)}</TableCell>
                <TableCell className="text-sm">{yes(r.assigned)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">
                  {r.crate ? <>{r.crate.packaging || "—"} · {t(`warehouse.crate_${r.crate.status}`)}
                    {r.crate.gross_kg != null && <div className="text-xs text-gray-500 tabular-nums">{t("warehouse.gross")} {fmtKg(r.crate.gross_kg, 1)}{r.crate.net_kg != null && ` · ${t("warehouse.net")} ${fmtKg(r.crate.net_kg, 1)}`} {t("warehouse.kg")}</div>}</> : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm font-mono">
                  {r.batch_id ? <button onClick={() => onOpenBatch(r.batch_id!)} className="text-brand hover:underline">{r.batch_number}</button> : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
