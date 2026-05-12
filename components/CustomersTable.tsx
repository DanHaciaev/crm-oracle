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

export default function CustomersTable() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");

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

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-sm text-gray-500 mt-1">Список клиентов и привязка к Telegram</p>
        </div>
        <input
          type="text"
          placeholder="Поиск по коду или названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-zinc-700 bg-transparent rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition w-72"
        />
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
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.country ?? "—"}</TableCell>
                  <TableCell className="text-xs text-gray-400">{c.customer_type ?? "—"}</TableCell>
                  <TableCell>{c.contact_phone ?? "—"}</TableCell>
                  <TableCell><TgStatusCell c={c} /></TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/customers/${c.id}`}
                      className="inline-block px-3 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800 transition"
                    >
                      Открыть
                    </Link>
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
