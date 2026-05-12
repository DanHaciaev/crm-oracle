"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  customer_name:    string | null;
  warehouse_name:   string | null;
  sales_doc_number: string | null;
  created_at:       string | null;
  lines:            Line[];
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateRu(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTimeRu(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PrintActPage() {
  const params              = useParams<{ id: string }>();
  const id                  = params.id;
  const [data, setData]     = useState<Detail | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res  = await fetch(`/api/weight-tickets/${id}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Ошибка");
      else         setData(json as Detail);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const totalGross = data?.lines.reduce((s, l) => s + l.gross_kg, 0) ?? 0;
  const totalTare  = data?.lines.reduce((s, l) => s + l.tare_kg,  0) ?? 0;
  const totalNet   = data?.lines.reduce((s, l) => s + l.net_kg,   0) ?? 0;
  const cratesCount = data?.lines.length ?? 0;
  const firstItem  = data?.lines[0]?.item_name ?? "—";

  if (error) {
    return <div className="p-8 text-red-600">Ошибка: {error}</div>;
  }
  if (!data) {
    return <div className="p-8 text-gray-500">Загрузка...</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-center mb-6 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
          >
            Печать / Tiparește
          </button>
        </div>

        <div className="text-center text-xs uppercase tracking-wider text-gray-500 mb-1">
          AGRO Company SRL
        </div>
        <h1 className="text-center text-xl font-bold mb-6">
          ВЕСОВОЙ АКТ / TICHET DE CANTARIRE
        </h1>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-5">
          <div><span className="text-gray-500">Номер / Nr.:</span> <strong>{data.ticket_number}</strong></div>
          <div><span className="text-gray-500">Дата / Data:</span> <strong>{fmtDateRu(data.ticket_date)}</strong></div>

          <div><span className="text-gray-500">Клиент / Client:</span> <strong>{data.customer_name ?? "—"}</strong></div>
          <div><span className="text-gray-500">Склад / Depozit:</span> <strong>{data.warehouse_name ?? "—"}</strong></div>

          <div><span className="text-gray-500">Документ продажи / Doc. vânzare:</span> <strong>{data.sales_doc_number ?? "—"}</strong></div>
          <div><span className="text-gray-500">Статус / Status:</span> <strong>{data.status}</strong></div>

          <div><span className="text-gray-500">Продукция / Produs:</span> <strong>{firstItem}</strong></div>
          <div><span className="text-gray-500">Время взвеш. / Ora cantaririi:</span> <strong>{fmtDateTimeRu(data.created_at)}</strong></div>

          <div><span className="text-gray-500">Кол-во ящиков / Nr. lazi:</span> <strong>{cratesCount}</strong></div>
          <div></div>
        </div>

        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-2 py-2 w-10">№</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Штрихкод / Cod</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Продукция / Produs</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Партия / Lot</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Брутто, кг</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Тара, кг</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Нетто, кг</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, idx) => (
              <tr key={l.id}>
                <td className="border border-gray-300 px-2 py-1.5 text-center">{l.line_no ?? idx + 1}</td>
                <td className="border border-gray-300 px-2 py-1.5 font-mono">{l.crate_code ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1.5">{l.item_name ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1.5">{l.batch_number ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(l.gross_kg)}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(l.tare_kg)}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(l.net_kg)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-gray-300 px-2 py-1.5 text-right" colSpan={4}>Итого / Total:</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(totalGross)}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(totalTare)}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{fmt(totalNet)}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-3 gap-2 mb-10 text-center">
          <div className="border border-gray-300 rounded p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Брутто / Brut</div>
            <div className="text-2xl font-bold">{fmt(totalGross)} кг</div>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Тара / Tara</div>
            <div className="text-2xl font-bold">{fmt(totalTare)} кг</div>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Нетто / Net</div>
            <div className="text-2xl font-bold">{fmt(totalNet)} кг</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-12 text-sm pt-8 border-t border-gray-200">
          <div>
            <div className="border-b border-gray-400 h-6 mb-1"></div>
            <div className="text-gray-500 text-xs">Весовщик / Cantaragiu</div>
          </div>
          <div>
            <div className="border-b border-gray-400 h-6 mb-1"></div>
            <div className="text-gray-500 text-xs">Получатель / Primitor</div>
          </div>
        </div>
      </div>
    </div>
  );
}
