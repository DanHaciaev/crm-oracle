/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

interface Customer {
  id:              number;
  code:            string;
  name:            string;
  country:         string | null;
  customer_type:   string | null;
  contact_phone:   string | null;
  contact_email:   string | null;
  active:          boolean;
  tg_linked:       boolean;
  tg_username:     string | null;
  tg_chat_id:      number | null;
  pending_invites: number;
}

async function exportCustomersCsv() {
  const res  = await fetch("/api/customers/export");
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TgStatusCell({ c }: { c: Customer }) {
  const t = useT();
  if (c.tg_linked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border border-emerald-800 text-green-800">
        ✓ {c.tg_username ? `@${c.tg_username}` : t("customers.tgLinked")}
      </span>
    );
  }
  if (c.pending_invites > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border border-gray-800 text-gray-600">
        {c.pending_invites} pending
      </span>
    );
  }
  return <span className="text-gray-400 text-sm">—</span>;
}

type ModalStep = "confirm" | "has_deps";

export default function CustomersTable() {
  const t = useT();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [modalStep, setModalStep]       = useState<ModalStep>("confirm");
  const [depCounts, setDepCounts]       = useState<{ sales: number; weight_tickets: number } | null>(null);
  const [working, setWorking]           = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/customers");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else         setCustomers(data as Customer[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = search
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()))
    : customers;

  function openDelete(c: Customer) { setDeleteTarget(c); setModalStep("confirm"); }
  function closeModal() { if (working) return; setDeleteTarget(null); }

  async function handleHardDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    const res  = await fetch(`/api/customers/${deleteTarget.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setWorking(false);
    if (res.ok) {
      setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } else if (res.status === 409 && (json as { code?: string }).code === "HAS_DEPENDENCIES") {
      setDepCounts((json as { counts?: { sales: number; weight_tickets: number } }).counts ?? null);
      setModalStep("has_deps");
    } else {
      alert((json as { error?: string }).error ?? t("customers.deleteError"));
    }
  }

  async function handleCascadeDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    const res  = await fetch(`/api/customers/${deleteTarget.id}?cascade=1`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setWorking(false);
    if (res.ok) {
      setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } else {
      alert((json as { error?: string }).error ?? t("customers.deleteError"));
    }
  }

  async function handleSoftDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    const res  = await fetch(`/api/customers/${deleteTarget.id}?soft=1`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setWorking(false);
    if (res.ok) {
      setCustomers((prev) =>
        prev.map((c) => c.id === deleteTarget.id ? { ...c, active: false } : c)
      );
      setDeleteTarget(null);
    } else {
      alert((json as { error?: string }).error ?? t("customers.deactivateError"));
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-10 gap-4 flex-col acts:flex-row acts:mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("customers.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("customers.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t("customers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800 transition w-72"
          />
          <button
            onClick={exportCustomersCsv}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-800 text-sm hover:bg-gray-100 transition shrink-0 text-gray-700"
            title={t("common.export")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      <div className="border border-gray-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("customers.code").toUpperCase()}</TableHead>
              <TableHead>{t("common.name").toUpperCase()}</TableHead>
              <TableHead>{t("common.country").toUpperCase()}</TableHead>
              <TableHead>{t("common.type").toUpperCase()}</TableHead>
              <TableHead>{t("common.phone").toUpperCase()}</TableHead>
              <TableHead>TELEGRAM</TableHead>
              <TableHead className="text-center">{t("common.actions").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("customers.noCustomers")}</TableCell></TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className={!c.active ? "opacity-50" : ""}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell className="font-medium">
                    {c.name}
                    {!c.active && <span className="ml-2 text-sm text-gray-400">({t("customers.deactivated")})</span>}
                  </TableCell>
                  <TableCell>{c.country ?? "—"}</TableCell>
                  <TableCell className="text-sm text-gray-400">{c.customer_type ?? "—"}</TableCell>
                  <TableCell>{c.contact_phone ?? "—"}</TableCell>
                  <TableCell><TgStatusCell c={c} /></TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/customers/${c.id}`}
                        className="inline-block px-3 py-1 text-sm rounded-md border border-gray-800 text-gray-700 hover:bg-gray-100 transition"
                      >
                        {t("customers.open")}
                      </Link>
                      <button
                        onClick={() => openDelete(c)}
                        className="px-3 py-1 text-sm rounded-md border border-red-800/60 text-red-400 hover:bg-red-950/40 transition"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            {modalStep === "confirm" ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{t("customers.deleteConfirmTitle")}</h2>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">{deleteTarget.name}</span>
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={closeModal} disabled={working}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:bg-gray-100 transition disabled:opacity-50 text-gray-700">
                    {t("common.cancel")}
                  </button>
                  <button onClick={handleHardDelete} disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50">
                    {working ? t("customers.deleting") : t("common.delete")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{t("customers.hasDepsTitle")}</h2>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">{deleteTarget.name}</span>
                  {depCounts && (
                    <span className="text-gray-700">
                      {": "}
                      {depCounts.sales > 0 && `${depCounts.sales} ${t("sales.title").toLowerCase()}`}
                      {depCounts.sales > 0 && depCounts.weight_tickets > 0 && ", "}
                      {depCounts.weight_tickets > 0 && `${depCounts.weight_tickets} ${t("weightTickets.title").toLowerCase()}`}
                    </span>
                  )}
                </p>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {t("customers.hasDepsWarning")}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={closeModal} disabled={working}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:bg-gray-100 transition disabled:opacity-50 text-gray-700">
                    {t("common.cancel")}
                  </button>
                  <button onClick={handleSoftDelete} disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50">
                    {working ? "..." : t("customers.deactivate")}
                  </button>
                  <button onClick={handleCascadeDelete} disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-red-700 text-white hover:bg-red-800 transition disabled:opacity-50">
                    {working ? t("customers.deleting") : t("customers.deleteAll")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
