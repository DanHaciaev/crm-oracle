/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface StorageClient {
  id: number; code: string; name: string;
  contact_phone: string | null; contact_email: string | null;
  stored_kg: number; revenue: number; last_activity: string | null;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtNum(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export default function CustodyPage() {
  const t = useT();
  const [rows, setRows]         = useState<StorageClient[]>([]);
  const [filtered, setFiltered] = useState<StorageClient[]>([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/custody")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: StorageClient[]) => { setRows(data); setFiltered(data); })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q)
    ));
  }, [search, rows]);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("custody.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("custody.subtitle")}</p>
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
              <TableHead>{t("custody.client").toUpperCase()}</TableHead>
              <TableHead className="hidden md:table-cell">{t("suppliers.phone").toUpperCase()}</TableHead>
              <TableHead className="text-right">{t("custody.storedKg").toUpperCase()}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t("custody.revenue").toUpperCase()}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t("custody.lastActivity").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-red-500 py-6">{error}</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-6">
                  {rows.length ? "Ничего не найдено" : t("custody.noClients")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code || "—"}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/custody/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                    {c.contact_email && (
                      <div className="text-xs text-gray-400 mt-0.5">{c.contact_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.contact_phone ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.stored_kg > 0 ? `${fmtNum(c.stored_kg)} кг` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden lg:table-cell">
                    {c.revenue > 0 ? `${fmtNum(c.revenue)} MDL` : "—"}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-sm text-gray-400">
                    {fmtDate(c.last_activity)}
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
