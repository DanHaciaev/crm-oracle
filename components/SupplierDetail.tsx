"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface Supplier {
  id: number; code: string; name: string;
  country: string | null; tax_id: string | null;
  contact_phone: string | null; contact_email: string | null;
  address: string | null; active: boolean;
}
interface Purchase {
  id: number; doc_number: string; doc_date: string | null;
  status: string; gross_kg: number; net_kg: number;
  amount: number; currency: string;
}
interface Data { supplier: Supplier; purchases: Purchase[] }

const STATUS_CLS: Record<string, string> = {
  draft:     "border-gray-400 text-gray-500",
  confirmed: "border-blue-400 text-blue-600",
  received:  "border-emerald-500 text-emerald-600",
  cancelled: "border-red-400 text-red-500",
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

export default function SupplierDetail({ id }: { id: string }) {
  const t = useT();
  const [data, setData]       = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/suppliers/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Data) => setData(d))
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error || !data) return <div className="p-8 text-sm text-red-500">{error ?? "Не найдено"}</div>;

  const { supplier: s, purchases } = data;
  const active = purchases.filter(p => p.status !== "cancelled");
  const totalAmount = active.reduce((a, p) => a + p.amount, 0);
  const totalNetKg  = active.reduce((a, p) => a + p.net_kg, 0);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <Link href="/suppliers" className="text-sm text-gray-400 hover:text-gray-700 transition">
        {t("suppliers.backToList")}
      </Link>

      {/* Header */}
      <div className="border border-[#c8d3e8] rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-gray-400 font-mono mb-0.5">{s.code}</div>
            <h1 className="text-2xl font-bold text-gray-900">{s.name}</h1>
          </div>
          {!s.active && (
            <span className="px-2 py-0.5 rounded text-xs border border-red-400 text-red-500 shrink-0">
              Неактивен
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[#c8d3e8]">
          <Field label={t("suppliers.country")} value={s.country} />
          <Field label="ИНН / Рег. номер"       value={s.tax_id} />
          <Field label={t("suppliers.phone")}   value={s.contact_phone} />
          <Field label={t("suppliers.email")}   value={s.contact_email} />
          {s.address && (
            <div className="col-span-2 sm:col-span-4">
              <Field label="Адрес" value={s.address} />
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("suppliers.purchaseCount"), value: String(active.length) },
          { label: `${t("suppliers.netKg")}, кг`,  value: fmtNum(totalNetKg) },
          { label: `${t("suppliers.totalPurchases")}, MDL`, value: fmtNum(totalAmount) },
        ].map(({ label, value }) => (
          <div key={label} className="border border-[#c8d3e8] rounded-xl p-4 text-center">
            <div className="text-xl font-bold tabular-nums text-gray-800">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Purchase history */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("suppliers.purchaseHistory")}</h2>
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("suppliers.docNumber").toUpperCase()}</TableHead>
                <TableHead>{t("suppliers.docDate").toUpperCase()}</TableHead>
                <TableHead>{t("suppliers.status").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("suppliers.totalKg").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("suppliers.netKg").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("suppliers.amount").toUpperCase()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-400 py-6">
                    {t("suppliers.noPurchases")}
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.doc_number}</TableCell>
                    <TableCell>{fmtDate(p.doc_date)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${STATUS_CLS[p.status] ?? "border-gray-400 text-gray-500"}`}>
                        {p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(p.gross_kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(p.net_kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(p.amount)}{" "}
                      <span className="text-gray-400 text-xs">{p.currency}</span>
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
