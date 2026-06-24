/* eslint-disable react-hooks/set-state-in-effect */
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
  country: string | null; contact_phone: string | null; contact_email: string | null;
  total_purchases: number; last_purchase: string | null; purchase_count: number;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export default function SuppliersPage() {
  const t = useT();
  const [rows, setRows]         = useState<Supplier[]>([]);
  const [filtered, setFiltered] = useState<Supplier[]>([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/suppliers")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Supplier[]) => { setRows(data); setFiltered(data); })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.country ?? "").toLowerCase().includes(q)
    ));
  }, [search, rows]);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("suppliers.title")}</h1>
        </div>
        <input
          type="text"
          placeholder={t("common.search")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#c8d3e8] transition w-full sm:w-72"
        />
      </div>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("suppliers.code").toUpperCase()}</TableHead>
              <TableHead>{t("suppliers.title").slice(0, -1).toUpperCase()}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("suppliers.country").toUpperCase()}</TableHead>
              <TableHead className="hidden md:table-cell">{t("suppliers.phone").toUpperCase()}</TableHead>
              <TableHead className="text-right">{t("suppliers.purchaseCount").toUpperCase()}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t("suppliers.totalPurchases").toUpperCase()}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t("suppliers.lastPurchase").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-6">
                  {rows.length ? "Ничего не найдено" : t("suppliers.noPurchases")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.code}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/suppliers/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                    {s.contact_email && (
                      <div className="text-xs text-gray-400 mt-0.5">{s.contact_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{s.country ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.contact_phone ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.purchase_count}</TableCell>
                  <TableCell className="text-right tabular-nums hidden lg:table-cell">
                    {s.total_purchases > 0 ? fmtMoney(s.total_purchases) : "—"}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-sm text-gray-400">
                    {fmtDate(s.last_purchase)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
