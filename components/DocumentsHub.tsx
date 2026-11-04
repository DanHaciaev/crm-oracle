"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface Rec {
  id: number; doc_number: string; doc_date: string; party: string;
  status: string; net_kg: number | null;
}
interface SalesRec extends Rec { has_decl: boolean }
interface CheckRec extends Rec { checklist_type: string; checklist_name: string }
interface Sources {
  sales: SalesRec[]; purchases: Rec[]; releases: Rec[]; checks: CheckRec[];
  warehouses: { id: number; name: string }[];
}

type Tab = "sales" | "purchases" | "custody" | "quality" | "period";

function fmtKg(v: number | null) {
  return v ? `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} кг` : "—";
}

function DocLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const cls = "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#dde3ef] text-xs text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition whitespace-nowrap";
  const body = <><Printer className="w-3.5 h-3.5 text-gray-400" />{label}</>;
  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
    : <Link href={href} target="_blank" className={cls}>{body}</Link>;
}

const print = (type: string, id: number) => `/documents/print/${type}?id=${id}`;

export default function DocumentsHub() {
  const t = useT();
  const [data, setData]       = useState<Sources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>("sales");
  const [search, setSearch]   = useState("");

  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo]     = useState(iso(today));
  const [warehouse, setWarehouse] = useState("");

  useEffect(() => {
    fetch("/api/documents")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Sources) => setData(d))
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [t]);

  const q = search.trim().toLowerCase();
  const match = (r: Rec) => !q || r.doc_number.toLowerCase().includes(q) || r.party.toLowerCase().includes(q);

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "sales")     return data.sales.filter(match);
    if (tab === "purchases") return data.purchases.filter(match);
    if (tab === "custody")   return data.releases.filter(match);
    if (tab === "quality")   return data.checks.filter(match);
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, q]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "sales",     label: t("documents.tabSales"),     count: data?.sales.length },
    { key: "purchases", label: t("documents.tabPurchases"), count: data?.purchases.length },
    { key: "custody",   label: t("documents.tabCustody"),   count: data?.releases.length },
    { key: "quality",   label: t("documents.tabQuality"),   count: data?.checks.length },
    { key: "period",    label: t("documents.tabPeriod") },
  ];

  function docsFor(r: Rec) {
    if (tab === "sales") {
      const s = r as SalesRec;
      return <>
        <DocLink href={print("sales_pallet_bon", s.id)} label={t("documents.salesBon")} />
        <DocLink href={print("shipping_note", s.id)}    label={t("documents.shippingNote")} />
        <DocLink href={print("export_decl", s.id)}      label={s.has_decl ? t("documents.exportDecl") : t("documents.exportDeclBlank")} />
        <DocLink href={`${BASE}/api/sales/${s.id}/pdf`}            label={t("documents.invoicePdf")} external />
        <DocLink href={`${BASE}/api/sales/${s.id}/fiscal-invoice`} label={t("documents.fiscalInvoice")} external />
      </>;
    }
    if (tab === "purchases") return <>
      <DocLink href={print("purchase_act", r.id)} label={t("documents.purchaseAct")} />
      <DocLink href={`/purchases/${r.id}/print`}  label={t("documents.purchaseBon")} />
    </>;
    if (tab === "custody") return <DocLink href={print("custody_release_act", r.id)} label={t("documents.custodyAct")} />;
    const c = r as CheckRec;
    return c.checklist_type === "gmp"
      ? <DocLink href={print("gmp_checklist", c.id)} label={t("documents.gmpChecklist")} />
      : <DocLink href={print("qa_protocol", c.id)}   label={t("documents.qaProtocol")} />;
  }

  const periodQs = () => {
    const sp = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (warehouse) sp.set("warehouse_id", warehouse);
    return sp.toString();
  };

  const emptyText = {
    sales: t("documents.emptySales"), purchases: t("documents.emptyPurchases"),
    custody: t("documents.emptyCustody"), quality: t("documents.emptyQuality"), period: "",
  }[tab];

  const inputCls = "border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none transition";

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between mb-6 gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold">{t("documents.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("documents.subtitle")}</p>
        </div>
        {tab !== "period" && (
          <input
            type="text"
            placeholder={t("documents.search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} w-full sm:w-72`}
          />
        )}
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto border-b border-[#dde3ef]">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === tb.key ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tb.label}{tb.count != null && <span className="ml-1.5 text-xs text-gray-400">{tb.count}</span>}
          </button>
        ))}
      </div>

      {tab === "period" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-[#c8d3e8] rounded-xl p-4 flex flex-wrap items-end gap-3 md:col-span-2">
            <label className="text-sm">
              <div className="text-gray-500 mb-1">{t("documents.dateFrom")}</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="text-sm">
              <div className="text-gray-500 mb-1">{t("documents.dateTo")}</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
            </label>
            <label className="text-sm">
              <div className="text-gray-500 mb-1">{t("documents.warehouse")}</div>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)} className={inputCls}>
                <option value="">{t("documents.allWarehouses")}</option>
                {data?.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          </div>
          {[
            { type: "mass_balance", title: t("documents.massBalance"), desc: t("documents.massBalanceDesc") },
            { type: "haccp_report", title: t("documents.haccpReport"), desc: t("documents.haccpReportDesc") },
          ].map(d => (
            <div key={d.type} className="border border-[#c8d3e8] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{d.desc}</div>
                </div>
              </div>
              <div><DocLink href={`/documents/print/${d.type}?${periodQs()}`} label={t("documents.print")} /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{(tab === "quality" ? t("documents.colBatch") : t("documents.colNumber")).toUpperCase()}</TableHead>
                <TableHead>{t("documents.colDate").toUpperCase()}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {(tab === "quality" ? t("documents.colInspector") : t("documents.colParty")).toUpperCase()}
                </TableHead>
                <TableHead className="text-right hidden lg:table-cell">
                  {(tab === "quality" ? t("documents.colChecklist") : t("documents.colKg")).toUpperCase()}
                </TableHead>
                <TableHead>{t("documents.colDocs").toUpperCase()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={5} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{q ? t("documents.notFound") : emptyText}</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.doc_number || "—"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{r.doc_date || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{r.party || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums hidden lg:table-cell">
                    {tab === "quality" ? (r as CheckRec).checklist_name || "—" : fmtKg(r.net_kg)}
                  </TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{docsFor(r)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">{t("documents.weightTicketsHint")}</p>
    </div>
  );
}
