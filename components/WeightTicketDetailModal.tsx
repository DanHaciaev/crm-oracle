"use client";

import { useEffect, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Line {
  id:           number;
  line_no:      number | null;
  crate_code:   string | null;
  batch_number: string | null;
  item_name:    string | null;
  item_name_ro: string | null;
  gross_kg:     number;
  tare_kg:      number;
  net_kg:       number;
}

interface Detail {
  id:               number;
  ticket_number:    string;
  ticket_date:      string | null;
  status:           string;
  operator:         string | null;
  notes:            string | null;
  customer_name:    string | null;
  warehouse_name:   string | null;
  sales_doc_number: string | null;
  lines:            Line[];
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toUTCString();
}

export default function WeightTicketDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData]       = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res  = await fetch(`/api/weight-tickets/${id}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Ошибка");
      else         setData(json as Detail);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalNet = data?.lines.reduce((s, l) => s + l.net_kg, 0) ?? 0;

  function handlePrint() {
    if (!data) return;
    window.open(`/acts/${data.id}/print`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold">Акт взвешивания / Act de cântărire</h2>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-gray-400 py-10 text-center">Загрузка...</div>
          ) : error ? (
            <div className="text-sm text-red-500 py-10 text-center">{error}</div>
          ) : !data ? null : (
            <>
              <div>
                <div className="text-xl font-bold font-mono">{data.ticket_number}</div>
                <div className="text-xs text-gray-400 mt-2 flex flex-wrap gap-x-2 gap-y-1">
                  <span>Клиент: <strong className="text-zinc-200">{data.customer_name ?? "—"}</strong></span>
                  <span>|</span>
                  <span>Склад: <strong className="text-zinc-200">{data.warehouse_name ?? "—"}</strong></span>
                  <span>|</span>
                  <span>Дата: <strong className="text-zinc-200">{fmtDate(data.ticket_date)}</strong></span>
                  <span>|</span>
                  <span>Статус: <strong className="text-zinc-200">{data.status}</strong></span>
                </div>
              </div>

              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>ШТРИХКОД</TableHead>
                      <TableHead>ПРОДУКТ</TableHead>
                      <TableHead className="text-right">БРУТТО</TableHead>
                      <TableHead className="text-right">ТАРА</TableHead>
                      <TableHead className="text-right">НЕТТО</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-400 py-6">Нет строк</TableCell>
                      </TableRow>
                    ) : (
                      data.lines.map((l, idx) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.line_no ?? idx + 1}</TableCell>
                          <TableCell className="font-mono">{l.crate_code ?? "—"}</TableCell>
                          <TableCell>{l.item_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(l.gross_kg)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(l.tare_kg)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(l.net_kg)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="text-right text-sm">
                Итого нетто: <span className="text-lg font-bold">{fmt(totalNet)} кг</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  Закрыть / Închide
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 text-sm rounded-lg border border-zinc-300 bg-zinc-100 text-black hover:bg-white transition"
                >
                  Печать
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
