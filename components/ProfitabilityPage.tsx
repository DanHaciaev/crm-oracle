"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, useLang, type Options } from "@/components/warehouse/shared";

interface Agg {
  key: string; label: string; sub?: string; href?: string;
  sold_kg: number; revenue: number; costed_revenue: number; cost: number;
  margin: number | null; margin_pct: number | null; coverage: number | null;
  avg_price?: number | null; cost_per_kg?: number | null; origin?: string;
}
interface Unpriced { purchase_id: number; purchase_doc: string; purchase_date: string | null; supplier_name: string; origin: string; sold_kg: number; revenue: number; batches: number }
interface Data {
  totals: Agg; by_item: Agg[]; by_supplier: Agg[]; by_customer: Agg[]; by_batch: Agg[];
  unpriced: Unpriced[]; other_origin_revenue: number;
}
type Tab = "by_item" | "by_supplier" | "by_customer" | "by_batch" | "unpriced";

const money = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Margin text: red when negative, muted when unknown (no purchase price).
function Margin({ v, p }: { v: number | null; p: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>;
  return <span className={v < 0 ? "text-red-600 font-semibold" : "text-emerald-700"}>{money(v)} <span className="text-xs">({pct(p)})</span></span>;
}

export default function ProfitabilityPage() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo]     = useState(iso(today));
  const [warehouse, setWarehouse] = useState("");
  const [item, setItem]         = useState("");
  const [supplier, setSupplier] = useState("");
  const [customer, setCustomer] = useState("");
  const [tab, setTab]           = useState<Tab>("by_item");

  const { data: options } = useFetch<Options & { customers: { id: number; name: string }[] }>(`/api/profitability/options?lang=${lang}`);

  const sp = new URLSearchParams({ lang, date_from: dateFrom, date_to: dateTo });
  if (warehouse) sp.set("warehouse_id", warehouse);
  if (item) sp.set("item_id", item);
  if (supplier) sp.set("supplier_id", supplier);
  if (customer) sp.set("customer_id", customer);
  const { data, error, loading } = useFetch<Data>(`/api/profitability?${sp.toString()}`);
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const tabs: { key: Tab; count?: number }[] = [
    { key: "by_item" }, { key: "by_supplier" }, { key: "by_customer" }, { key: "by_batch" },
    { key: "unpriced", count: data?.unpriced.length },
  ];
  const tt = data?.totals;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("profit.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("profit.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={warehouse} onChange={setWarehouse} all={t("warehouse.allWarehouses")} options={(options?.warehouses ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={item} onChange={setItem} all={t("warehouse.allItems")} options={(options?.items ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={supplier} onChange={setSupplier} all={t("warehouse.allSuppliers")} options={(options?.suppliers ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <Select value={customer} onChange={setCustomer} all={t("profit.allCustomers")} options={(options?.customers ?? []).map(o => ({ value: o.id, label: o.name }))} />
        <a href={`${BASE}/api/reports/profitability?format=xlsx&${sp.toString()}`}
           className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition">
          <FileSpreadsheet className="w-4 h-4" />Excel
        </a>
      </div>

      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      {tt && <>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-4">
          <StatTile label={t("profit.revenue")} value={money(tt.revenue)} unit="MDL" hint={`${fmtKg(tt.sold_kg / 1000, 1)} ${t("warehouse.ton")}`} />
          <StatTile label={t("profit.costedRevenue")} value={money(tt.costed_revenue)} unit="MDL" hint={t("profit.costedRevenueHint")} />
          <StatTile label={t("profit.cost")} value={money(tt.cost)} unit="MDL" />
          <StatTile label={t("profit.margin")} value={money(tt.margin)} unit="MDL" hint={pct(tt.margin_pct)} tone={(tt.margin ?? 0) < 0 ? "bad" : undefined} />
          <StatTile label={t("profit.coverage")} value={pct(tt.coverage)} hint={t("profit.coverageHint")} tone={(tt.coverage ?? 100) < 80 ? "warn" : undefined} />
        </div>
        {(tt.coverage ?? 100) < 100 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t("profit.coverageWarning").replace("{pct}", pct(tt.coverage)).replace("{n}", String(data!.unpriced.length))}</span>
          </div>
        )}
      </>}

      <div className="flex gap-1 mb-3 overflow-x-auto border-b border-[#dde3ef]">
        {tabs.map(x => (
          <button key={x.key} onClick={() => setTab(x.key)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === x.key ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`profit.tab_${x.key}`)}{x.count != null && <span className="ml-1.5 text-xs text-gray-400">{x.count}</span>}
          </button>
        ))}
      </div>

      {!data || loading && !data ? (
        <div className="text-sm text-gray-400">{t("common.loading")}</div>
      ) : tab === "unpriced" ? (
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-white">
              <TableRow>
                <TableHead>{t("profit.colPurchase")}</TableHead><TableHead>{t("warehouse.colSupplier")}</TableHead>
                <TableHead className="text-right">{t("profit.colSoldKg")}</TableHead><TableHead className="text-right">{t("profit.colRevenue")}</TableHead>
                <TableHead>{t("profit.colOrigin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.unpriced.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("profit.allPriced")}</TableCell></TableRow>
              ) : data.unpriced.map(u => (
                <TableRow key={u.purchase_id}>
                  <TableCell><Link href={`/purchases?q=${encodeURIComponent(u.purchase_doc)}`} className="font-mono text-sm text-brand hover:underline">{u.purchase_doc}</Link>
                    <div className="text-xs text-gray-400">{fmtDate(u.purchase_date)}</div></TableCell>
                  <TableCell className="text-sm">{u.supplier_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKg(u.sold_kg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(u.revenue)}</TableCell>
                  <TableCell className="text-sm">{t(`profit.origin_${u.origin}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-white">
              <TableRow>
                <TableHead>{t(`profit.col_${tab}`)}</TableHead>
                <TableHead className="text-right">{t("profit.colSoldKg")}</TableHead>
                <TableHead className="text-right">{t("profit.colRevenue")}</TableHead>
                <TableHead className="text-right hidden md:table-cell">{t("profit.colAvgPrice")}</TableHead>
                {tab === "by_batch" && <TableHead className="text-right hidden md:table-cell">{t("profit.colCostPerKg")}</TableHead>}
                <TableHead className="text-right hidden lg:table-cell">{t("profit.colCost")}</TableHead>
                <TableHead className="text-right">{t("profit.colMargin")}</TableHead>
                <TableHead className="text-right hidden sm:table-cell">{t("profit.colCoverage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data[tab].length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">{t("profit.empty")}</TableCell></TableRow>
              ) : data[tab].map(a => (
                <TableRow key={a.key}>
                  <TableCell>
                    {a.href ? <Link href={a.href} className={`text-brand hover:underline ${tab === "by_batch" ? "font-mono text-sm" : ""}`}>{a.label}</Link> : a.label}
                    {a.sub && <div className="text-xs text-gray-400">{a.sub}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKg(a.sold_kg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(a.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums hidden md:table-cell">{a.avg_price != null ? a.avg_price.toFixed(2) : "—"}</TableCell>
                  {tab === "by_batch" && <TableCell className="text-right tabular-nums hidden md:table-cell">{a.cost_per_kg != null ? a.cost_per_kg.toFixed(2) : <span className="text-amber-600 text-xs">{t("profit.noPrice")}</span>}</TableCell>}
                  <TableCell className="text-right tabular-nums hidden lg:table-cell">{a.cost > 0 ? money(a.cost) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums"><Margin v={a.margin} p={a.margin_pct} /></TableCell>
                  <TableCell className={`text-right tabular-nums hidden sm:table-cell ${(a.coverage ?? 0) < 50 ? "text-amber-600" : "text-gray-600"}`}>{pct(a.coverage)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">{t("profit.method")}</p>
    </div>
  );
}
