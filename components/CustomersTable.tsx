/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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

function exportCustomersCsv(customers: Customer[]) {
  const headers = ["Код", "Название", "Страна", "Тип", "Телефон", "Email", "Telegram"];
  const rows = customers.map((c) => [
    c.code, c.name,
    c.country ?? "",
    c.customer_type ?? "",
    c.contact_phone ?? "",
    c.contact_email ?? "",
    c.tg_linked ? (c.tg_username ? `@${c.tg_username}` : "привязан") : "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TgStatusCell({ c }: { c: Customer }) {
  if (c.tg_linked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-emerald-500/30 text-emerald-300">
        ✓ {c.tg_username ? `@${c.tg_username}` : "привязан"}
      </span>
    );
  }
  if (c.pending_invites > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-zinc-600 text-zinc-300">
        {c.pending_invites} pending
      </span>
    );
  }
  return <span className="text-zinc-600 text-xs">—</span>;
}

// "confirm" → первый экран подтверждения
// "has_deps" → у клиента есть документы, предлагаем деактивацию
type ModalStep = "confirm" | "has_deps";

export default function CustomersTable() {
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
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else         setCustomers(data as Customer[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = search
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()))
    : customers;

  function openDelete(c: Customer) {
    setDeleteTarget(c);
    setModalStep("confirm");
  }

  function closeModal() {
    if (working) return;
    setDeleteTarget(null);
  }

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
      alert((json as { error?: string }).error ?? "Ошибка удаления");
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
      alert((json as { error?: string }).error ?? "Ошибка удаления");
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
      alert((json as { error?: string }).error ?? "Ошибка деактивации");
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-10 gap-4 flex-col acts:flex-row acts:mb-6">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-sm text-gray-500 mt-1">Список клиентов и привязка к Telegram</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Поиск по коду или названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-zinc-700 bg-transparent rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition w-72"
          />
          <button
            onClick={() => exportCustomersCsv(filtered)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-700 text-sm hover:bg-zinc-800/40 transition shrink-0"
            title="Экспорт в CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>КОД</TableHead>
              <TableHead>НАЗВАНИЕ</TableHead>
              <TableHead>СТРАНА</TableHead>
              <TableHead>ТИП</TableHead>
              <TableHead>ТЕЛЕФОН</TableHead>
              <TableHead>TELEGRAM</TableHead>
              <TableHead className="text-right">ДЕЙСТВИЯ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">Загрузка...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={7} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">Нет клиентов</TableCell></TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className={!c.active ? "opacity-50" : ""}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell className="font-medium">
                    {c.name}
                    {!c.active && <span className="ml-2 text-xs text-zinc-500">(деактивирован)</span>}
                  </TableCell>
                  <TableCell>{c.country ?? "—"}</TableCell>
                  <TableCell className="text-xs text-gray-400">{c.customer_type ?? "—"}</TableCell>
                  <TableCell>{c.contact_phone ?? "—"}</TableCell>
                  <TableCell><TgStatusCell c={c} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/customers/${c.id}`}
                        className="inline-block px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-300 transition"
                      >
                        Открыть
                      </Link>
                      <button
                        onClick={() => openDelete(c)}
                        className="px-3 py-1 text-xs rounded-md border border-red-800/60 text-red-400 hover:bg-red-950/40 transition"
                      >
                        Удалить
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            {modalStep === "confirm" ? (
              <>
                <h2 className="text-lg font-semibold text-white">Удалить клиента?</h2>
                <p className="text-sm text-zinc-400">
                  Вы собираетесь удалить{" "}
                  <span className="font-semibold text-white">{deleteTarget.name}</span>.
                  TG-привязки и токены приглашений будут удалены. Это действие необратимо.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeModal}
                    disabled={working}
                    className="px-4 py-2 text-sm text-white rounded-lg border border-zinc-700 hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleHardDelete}
                    disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {working ? "Удаление..." : "Удалить"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white">Есть связанные документы</h2>
                <p className="text-sm text-zinc-400">
                  У клиента <span className="font-semibold text-white">{deleteTarget.name}</span> есть связанные данные
                  {depCounts && (
                    <span className="text-white">
                      {": "}
                      {depCounts.sales > 0 && `${depCounts.sales} прод.`}
                      {depCounts.sales > 0 && depCounts.weight_tickets > 0 && ", "}
                      {depCounts.weight_tickets > 0 && `${depCounts.weight_tickets} актов`}
                    </span>
                  )}
                  .
                </p>
                <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
                  Удаление уничтожит все продажи, акты взвешивания, чаты и историю этого клиента. Это необратимо.
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeModal}
                    disabled={working}
                    className="px-4 py-2 text-sm rounded-lg text-white border border-zinc-700 hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSoftDelete}
                    disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    {working ? "..." : "Деактивировать"}
                  </button>
                  <button
                    onClick={handleCascadeDelete}
                    disabled={working}
                    className="px-4 py-2 text-sm rounded-lg bg-red-700 text-white hover:bg-red-800 transition disabled:opacity-50"
                  >
                    {working ? "Удаление..." : "Удалить всё"}
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
