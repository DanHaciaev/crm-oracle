/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT, useLocale } from "@/lib/locale";

interface Item {
  id:               number;
  name_ru:          string;
  name_ro:          string;
  item_group:       string;
  unit:             string;
  default_tare_kg:  number | null;
  shelf_life_days:  number | null;
  optimal_temp_min: number | null;
  optimal_temp_max: number | null;
  total_revenue:    number;
  total_net_kg:     number;
  orders_count:     number;
  last_sale_date:   string | null;
}

type SortKey = "name_ru" | "total_revenue" | "total_net_kg" | "orders_count";
type SortDir = "asc" | "desc";

function GroupBadge({ group }: { group: string }) {
  const t = useT();
  const cfg: Record<string, string> = {
    fruit:     "border-orange-500/40 text-orange-400 bg-orange-500/10",
    vegetable: "border-green-500/40 text-green-400 bg-green-500/10",
    berry:     "border-pink-500/40 text-pink-400 bg-pink-500/10",
  };
  const cls = cfg[group] ?? "border-gray-800 text-gray-500 bg-gray-100";
  const key = `items.groups.${group}`;
  const label = t(key);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium border ${cls}`}>
      {label === key ? group : label}
    </span>
  );
}

function TempBadge({ min, max }: { min: number | null; max: number | null }) {
  if (min === null && max === null) return <span className="text-gray-400">—</span>;
  return (
    <span className="font-mono text-sm text-gray-600">
      {min ?? "?"}…{max ?? "?"}°C
    </span>
  );
}

export default function ItemsTable() {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems]       = useState<Item[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [group, setGroup]       = useState("all");
  const [sortKey, setSortKey]   = useState<SortKey>("name_ru");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");

  const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";

  function fmtMoney(n: number) {
    return n.toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtKg(n: number) {
    return n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(s: string | null): string {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function groupLabel(g: string) {
    const key = `items.groups.${g}`;
    const label = t(key);
    return label === key ? g : label;
  }

  function exportCsv(exportItems: Item[]) {
    const headers = [
      t("items.colItem") + " (RU)", t("items.colItem") + " (RO)",
      t("items.colGroup"), t("items.colUnit"),
      t("items.tare") + " кг", t("items.colTareShelf"),
      t("items.colTemp"),
      t("items.colRevenue"), t("items.colNetKg"),
      t("items.colOrders"), t("items.colLastSale"),
    ];
    const rows = exportItems.map((i) => [
      i.name_ru, i.name_ro,
      groupLabel(i.item_group),
      i.unit,
      i.default_tare_kg ?? "",
      i.shelf_life_days ?? "",
      (i.optimal_temp_min !== null || i.optimal_temp_max !== null)
        ? `${i.optimal_temp_min ?? "?"}...${i.optimal_temp_max ?? "?"}°C` : "",
      i.total_revenue.toFixed(2).replace(".", ","),
      i.total_net_kg.toFixed(2).replace(".", ","),
      i.orders_count,
      fmtDate(i.last_sale_date),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res  = await fetch("/api/items");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else         setItems(data as Item[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const groups = useMemo(() => {
    const seen = new Set(items.map((i) => i.item_group).filter(Boolean));
    return [...seen].sort();
  }, [items]);

  const stats = useMemo(() => ({
    total:      items.length,
    revenue:    items.reduce((s, i) => s + i.total_revenue, 0),
    net_kg:     items.reduce((s, i) => s + i.total_net_kg, 0),
    withSales:  items.filter((i) => i.orders_count > 0).length,
  }), [items]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name_ru" ? "asc" : "desc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = items.filter((i) => {
      const matchGroup  = group === "all" || i.item_group === group;
      const matchSearch = !q ||
        i.name_ru.toLowerCase().includes(q) ||
        i.name_ro.toLowerCase().includes(q) ||
        i.unit.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    });
    list = [...list].sort((a, b) => {
      let av: string | number = a[sortKey];
      let bv: string | number = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, group, sortKey, sortDir]);

  function sortIcon(col: SortKey) {
    if (sortKey !== col) return <span className="text-gray-400 ml-1">⇅</span>;
    return <span className="text-gray-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col acts:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("items.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("items.catalogSubtitle")}</p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-800 text-sm hover:bg-gray-100 transition shrink-0 text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t("weightTickets.exportCsv")}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          type="text"
          placeholder={t("items.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition w-60"
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="border border-gray-800 bg-white rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-800 transition"
        >
          <option value="all">{t("items.allGroups")}</option>
          {groups.map((g) => (
            <option key={g} value={g}>{groupLabel(g)}</option>
          ))}
        </select>
        {(search || group !== "all") && (
          <button
            onClick={() => { setSearch(""); setGroup("all"); }}
            className="text-sm text-gray-400 hover:text-gray-700 px-2 py-1.5 transition"
          >
            {t("common.reset")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 acts:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("items.statsTotal")}    value={String(stats.total)} />
        <StatCard label={t("items.statsWithSales")} value={String(stats.withSales)} />
        <StatCard label={t("items.statsRevenue")}  value={fmtMoney(stats.revenue)} suffix="MDL" />
        <StatCard label={t("items.statsNetKg")}    value={fmtKg(stats.net_kg)} />
      </div>

      <div className="border border-gray-800 rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name_ru")}>
                {t("items.colItem").toUpperCase()} {sortIcon("name_ru")}
              </TableHead>
              <TableHead>{t("items.colGroup").toUpperCase()}</TableHead>
              <TableHead>{t("items.colUnit").toUpperCase()}</TableHead>
              <TableHead>{t("items.colTareShelf").toUpperCase()}</TableHead>
              <TableHead>{t("items.colTemp").toUpperCase()}</TableHead>
              <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("total_revenue")}>
                {t("items.colRevenue").toUpperCase()} {sortIcon("total_revenue")}
              </TableHead>
              <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("total_net_kg")}>
                {t("items.colNetKg").toUpperCase()} {sortIcon("total_net_kg")}
              </TableHead>
              <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("orders_count")}>
                {t("items.colOrders").toUpperCase()} {sortIcon("orders_count")}
              </TableHead>
              <TableHead>{t("items.colLastSale").toUpperCase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={9} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-8">{t("items.noItems")}</TableCell></TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell>
                    <div className="font-medium">{item.name_ru || "—"}</div>
                    {item.name_ro && <div className="text-sm text-gray-400">{item.name_ro}</div>}
                  </TableCell>
                  <TableCell><GroupBadge group={item.item_group} /></TableCell>
                  <TableCell className="text-gray-400 text-sm">{item.unit || "—"}</TableCell>
                  <TableCell className="text-gray-400 text-sm">
                    {item.default_tare_kg !== null ? `${item.default_tare_kg} ${t("items.tare")}` : "—"}
                    {item.shelf_life_days !== null && (
                      <div>{item.shelf_life_days} {t("items.daysAbbr")}</div>
                    )}
                  </TableCell>
                  <TableCell><TempBadge min={item.optimal_temp_min} max={item.optimal_temp_max} /></TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    {item.total_revenue > 0 ? fmtMoney(item.total_revenue) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    {item.total_net_kg > 0 ? fmtKg(item.total_net_kg) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {item.orders_count > 0
                      ? <span className="font-medium">{item.orders_count}</span>
                      : <span className="text-gray-400">0</span>}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{fmtDate(item.last_sale_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && !loading && (
        <div className="mt-3 text-center text-sm text-gray-400">
          {t("weightTickets.showing")}: {filtered.length} {t("common.of")} {items.length}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="border border-gray-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold tabular-nums">
        {value}{suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
      </div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
