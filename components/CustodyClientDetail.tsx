"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Printer } from "lucide-react";
import { useT } from "@/lib/locale";

interface Client {
  id: number; code: string; name: string;
  contact_phone: string | null; contact_email: string | null;
  address: string | null; active: boolean;
}
interface Batch {
  id: number; batch_number: string; item_name: string;
  warehouse_name: string | null; cell_code: string | null;
  qty_kg: number | null; pallets_count: number | null; crates_count: number | null;
  status: string; received_at: string | null;
}
interface Release {
  id: number; release_number: string; release_date: string | null;
  qty_kg: number; storage_amount: number; precooling_amount: number; total_amount: number;
}
interface Data { client: Client; batches: Batch[]; releases: Release[] }

const BATCH_STATUS_CLS: Record<string, string> = {
  stored:   "border-blue-400 text-blue-600",
  released: "border-emerald-500 text-emerald-600",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtNum(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm mt-0.5 text-gray-800">{value ?? "—"}</div>
    </div>
  );
}

export default function CustodyClientDetail({ id }: { id: string }) {
  const t = useT();
  const [data, setData]       = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/custody/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Data) => setData(d))
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error || !data) return <div className="p-8 text-sm text-red-500">{error ?? "Не найдено"}</div>;

  const { client: c, batches, releases } = data;
  const storedKg   = batches.filter(b => b.status === "stored").reduce((a, b) => a + (b.qty_kg ?? 0), 0);
  const revenue    = releases.reduce((a, r) => a + r.total_amount, 0);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <Link href="/custody" className="text-sm text-gray-400 hover:text-gray-700 transition">
        {t("custody.backToList")}
      </Link>

      {/* Header */}
      <div className="border border-[#c8d3e8] rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-gray-400 font-mono mb-0.5">{c.code}</div>
            <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
          </div>
          {!c.active && (
            <span className="px-2 py-0.5 rounded text-xs border border-red-400 text-red-500 shrink-0">
              Неактивен
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[#c8d3e8]">
          <Field label={t("suppliers.phone")} value={c.contact_phone} />
          <Field label={t("suppliers.email")} value={c.contact_email} />
          {c.address && (
            <div className="col-span-2 sm:col-span-2">
              <Field label="Адрес" value={c.address} />
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t("custody.storedKg"), value: `${fmtNum(storedKg)} кг` },
          { label: t("custody.batchesOnStorage"), value: String(batches.filter(b => b.status === "stored").length) },
          { label: t("custody.revenue"), value: `${fmtNum(revenue)} MDL` },
        ].map(({ label, value }) => (
          <div key={label} className="border border-[#c8d3e8] rounded-xl p-4 text-center">
            <div className="text-xl font-bold tabular-nums text-gray-800">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Stored batches */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("custody.batches")}</h2>
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("custody.item").toUpperCase()}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("custody.warehouse").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("custody.qty").toUpperCase()}</TableHead>
                <TableHead>{t("common.status").toUpperCase()}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("custody.receivedAt").toUpperCase()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-400 py-6">
                    {t("custody.noBatches")}
                  </TableCell>
                </TableRow>
              ) : (
                batches.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">
                      {b.item_name}
                      {b.batch_number && <div className="text-xs text-gray-400 font-mono">{b.batch_number}</div>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-gray-600">
                      {[b.warehouse_name, b.cell_code].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.qty_kg != null ? `${fmtNum(b.qty_kg)} кг` : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${BATCH_STATUS_CLS[b.status] ?? "border-gray-400 text-gray-500"}`}>
                        {b.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-gray-400">{fmtDate(b.received_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Release history */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("custody.releases")}</h2>
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("custody.releaseNumber").toUpperCase()}</TableHead>
                <TableHead>{t("suppliers.docDate").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("custody.qty").toUpperCase()}</TableHead>
                <TableHead className="text-right hidden sm:table-cell">{t("custody.storageAmount").toUpperCase()}</TableHead>
                <TableHead className="text-right hidden sm:table-cell">{t("custody.precoolingAmount").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("suppliers.amount").toUpperCase()}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-6">
                    {t("custody.noReleases")}
                  </TableCell>
                </TableRow>
              ) : (
                releases.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.release_number}</TableCell>
                    <TableCell>{fmtDate(r.release_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.qty_kg)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">{fmtNum(r.storage_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">{fmtNum(r.precooling_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.total_amount)} MDL</TableCell>
                    <TableCell>
                      <Link
                        href={`/documents/print/custody_release_act?id=${r.id}`}
                        target="_blank"
                        title={t("documents.custodyAct")}
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
                      >
                        <Printer className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
