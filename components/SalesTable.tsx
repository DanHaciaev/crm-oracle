/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LayoutList, Columns3, FileDown, X, MessageSquare,
  Calendar, ArrowRight, ExternalLink, Clock, Receipt,
} from "lucide-react";
import { useT } from "@/lib/locale";

export interface SaleDoc {
  id:               number;
  doc_number:       string;
  doc_date:         string | null;
  customer_name:    string;
  customer_id:      number | null;
  sale_type:        string;
  status:           string;
  total_amount:     number;
  total_amount_mdl: number;
  currency_code:    string;
  total_net_kg:     number;
  invoice_number:   string;
}

interface Activity {
  id:         number;
  act_type:   string;
  body:       string | null;
  outcome:    string | null;
  created_by: string | null;
  created_at: string | null;
}

const STATUS_CLS: Record<string, string> = {
  draft:     "border-[#c8d3e8]    text-gray-500    bg-gray-100",
  confirmed: "border-blue-500/40  text-blue-400   bg-blue-500/10",
  shipped:   "border-violet-500/40 text-violet-400 bg-violet-500/10",
  delivered: "border-amber-500/40 text-amber-500  bg-amber-50",
  closed:    "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  cancelled: "border-red-500/40   text-red-400    bg-red-500/10",
};

const TYPE_CLS: Record<string, string> = {
  domestic: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  export:   "border-sky-500/40   text-sky-400   bg-sky-500/10",
};

const KANBAN_STATUSES = ["draft", "confirmed", "shipped", "delivered", "closed", "cancelled"] as const;

const KANBAN_COLORS: Record<string, { bar: string; dot: string; text: string }> = {
  draft:     { bar: "bg-gray-400",    dot: "bg-gray-400",    text: "text-gray-600" },
  confirmed: { bar: "bg-blue-500",    dot: "bg-blue-500",    text: "text-blue-700" },
  shipped:   { bar: "bg-violet-500",  dot: "bg-violet-500",  text: "text-violet-700" },
  delivered: { bar: "bg-amber-500",   dot: "bg-amber-500",   text: "text-amber-700" },
  closed:    { bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
  cancelled: { bar: "bg-red-400",     dot: "bg-red-400",     text: "text-red-600" },
};

const KANBAN_CARD_LEFT: Record<string, string> = {
  draft:     "border-l-gray-300",
  confirmed: "border-l-blue-400",
  shipped:   "border-l-violet-400",
  delivered: "border-l-amber-400",
  closed:    "border-l-emerald-400",
  cancelled: "border-l-red-300",
};

const ACT_ICONS: Record<string, string> = {
  call:    "📞", meeting: "🤝", note: "📝", email: "✉️", other: "💬",
};

function StatusBadge({ status }: { status: string }) {
  const t   = useT();
  const cls = STATUS_CLS[status] ?? "border-[#c8d3e8] text-gray-500";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {t(`sales.statuses.${status}`) || status}
  </span>;
}

function TypeBadge({ type }: { type: string }) {
  const t   = useT();
  const cls = TYPE_CLS[type] ?? "border-[#c8d3e8] text-gray-500";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {t(`sales.types.${type}`) || type}
  </span>;
}


async function downloadPdf(id: number, docNumber: string) {
  const res = await fetch(`/api/sales/${id}/pdf`);
  if (!res.ok) return;
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `invoice-${docNumber.replace(/\//g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadFiscalInvoice(id: number, docNumber: string) {
  const res = await fetch(`/api/sales/${id}/fiscal-invoice`);
  if (!res.ok) return;
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `factura-${docNumber.replace(/\//g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtKg(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Deal detail right panel ──────────────────────────────────────────────────

function DealPanel({
  doc,
  onClose,
  onStatusChange,
}: {
  doc: SaleDoc;
  onClose: () => void;
  onStatusChange: (id: number, s: string) => void;
}) {
  const t = useT();
  const [tab, setTab]         = useState<"details" | "activity">("details");
  const [activities, setActs] = useState<Activity[]>([]);
  const [loadingActs, setLA]  = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (tab !== "activity" || !doc.customer_id) return;
    setLA(true);
    fetch(`/api/activities?customer_id=${doc.customer_id}`)
      .then(r => r.json())
      .then((data: Activity[]) => setActs(data))
      .catch(() => setActs([]))
      .finally(() => setLA(false));
  }, [tab, doc.customer_id]);

  async function changeStatus(newStatus: string) {
    setUpdating(true);
    await fetch(`/api/sales/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdating(false);
    onStatusChange(doc.id, newStatus);
  }

  const initials = doc.customer_name
    ? doc.customer_name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "??";

  const PIPELINE = ["draft", "confirmed", "shipped", "delivered", "closed"] as const;
  const pipeIdx  = PIPELINE.indexOf(doc.status as typeof PIPELINE[number]);
  const isCancelled = doc.status === "cancelled";
  const accent = KANBAN_COLORS[doc.status] ?? KANBAN_COLORS.draft;

  return (
    <aside className="w-full md:w-80 shrink-0 flex flex-col bg-white border-l border-[#e2e8f0] overflow-y-auto" style={{ maxHeight: "calc(100vh - 56px)" }}>

      {/* Colored accent bar */}
      <div className={`h-1 w-full shrink-0 ${accent.bar}`} />

      {/* Header: close button */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <span className="text-[11px] font-mono text-gray-400">{doc.doc_number}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition p-0.5 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Customer + amount hero */}
      <div className="px-4 pb-4 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${accent.bar}`}>
            {initials}
          </div>
          <div className="min-w-0">
            {doc.customer_id ? (
              <Link href={`/customers/${doc.customer_id}`}
                className="font-semibold text-gray-900 hover:text-brand transition flex items-center gap-1 group truncate">
                <span className="truncate">{doc.customer_name || "—"}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </Link>
            ) : (
              <div className="font-semibold text-gray-900 truncate">{doc.customer_name || "—"}</div>
            )}
            <StatusBadge status={doc.status} />
          </div>
        </div>

        {/* Amount */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-gray-900 tabular-nums leading-none">
            {fmtMoney(doc.total_amount)}
            <span className="text-lg font-medium text-gray-400 ml-1.5">{doc.currency_code || "MDL"}</span>
          </div>
          {doc.currency_code && doc.currency_code !== "MDL" && (
            <div className="text-xs text-gray-400 mt-1 tabular-nums">≈ {fmtMoney(doc.total_amount_mdl)} MDL</div>
          )}
        </div>

        {/* Pipeline stepper */}
        {!isCancelled ? (
          <div>
            <div className="flex gap-1 mb-1">
              {PIPELINE.map((s, i) => {
                const c = KANBAN_COLORS[s];
                const active = i <= pipeIdx;
                return (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    disabled={updating}
                    title={t(`sales.statuses.${s}`)}
                    className={`flex-1 h-1.5 rounded-full transition-all ${active ? c.bar : "bg-gray-200 hover:bg-gray-300"}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between">
              {PIPELINE.map((s, i) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={updating}
                  className={`text-[10px] transition flex-1 text-center ${
                    i === pipeIdx ? `font-semibold ${accent.text}` : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t(`sales.statuses.${s}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-500 font-medium">Сделка отменена</span>
            <button
              onClick={() => changeStatus("draft")}
              disabled={updating}
              className="text-xs text-gray-500 hover:text-brand underline transition"
            >
              Восстановить
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-y border-[#e8edf5] px-4 shrink-0 bg-gray-50/60">
        {(["details", "activity"] as const).map(tb => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`py-2.5 px-0.5 mr-5 text-sm border-b-2 transition -mb-px ${
              tab === tb
                ? "border-brand text-brand font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tb === "details" ? "О сделке" : "Активность"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "details" && (
          <div className="p-4 space-y-3">

            {/* Meta rows */}
            <div className="rounded-xl border border-[#e8edf5] divide-y divide-[#f0f4fb] overflow-hidden">
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Дата" value={fmtDate(doc.doc_date)} padded />
              <InfoRow icon={<ArrowRight className="w-3.5 h-3.5" />} label="Тип" padded>
                <TypeBadge type={doc.sale_type} />
              </InfoRow>
              <InfoRow icon={<MessageSquare className="w-3.5 h-3.5" />} label="Вес нетто" value={`${fmtKg(doc.total_net_kg)} кг`} padded />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => downloadPdf(doc.id, doc.doc_number)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#dde3ef] text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition"
              >
                <FileDown className="w-4 h-4 text-gray-500" />
                PDF
              </button>
              <button
                onClick={() => downloadFiscalInvoice(doc.id, doc.doc_number)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#dde3ef] text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition"
              >
                <Receipt className="w-4 h-4 text-gray-500" />
                Фактура
              </button>
            </div>
            {doc.customer_id && (
              <Link
                href={`/customers/${doc.customer_id}`}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-brand/5 border border-brand/20 text-sm text-brand hover:bg-brand/10 transition font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Перейти к клиенту
              </Link>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="p-4">
            {!doc.customer_id ? (
              <p className="text-sm text-gray-400 text-center py-8">Клиент не привязан</p>
            ) : loadingActs ? (
              <p className="text-sm text-gray-400 text-center py-8">Загрузка...</p>
            ) : activities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Активностей нет</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />
                <div className="space-y-4">
                  <div className="flex gap-3 relative">
                    <div className="w-7 h-7 rounded-full bg-brand/10 border-2 border-white flex items-center justify-center text-xs shrink-0 z-10">📋</div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="text-sm text-gray-700">Сделка создана</div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{fmtDate(doc.doc_date)}
                      </div>
                    </div>
                  </div>
                  {activities.map(act => (
                    <div key={act.id} className="flex gap-3 relative">
                      <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs shrink-0 z-10">
                        {ACT_ICONS[act.act_type] ?? "💬"}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        {act.body    && <div className="text-sm text-gray-700">{act.body}</div>}
                        {act.outcome && <div className="text-xs text-gray-500 mt-0.5 italic">{act.outcome}</div>}
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{fmtDateTime(act.created_at)}
                          {act.created_by && <span>· {act.created_by}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function InfoRow({
  icon, label, value, children, padded,
}: {
  icon: React.ReactNode; label: string; value?: string; children?: React.ReactNode; padded?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 ${padded ? "px-3 py-2.5" : ""}`}>
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400">{label}</div>
        {children ?? <div className="text-sm text-gray-800 mt-0.5">{value}</div>}
      </div>
    </div>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({
  doc,
  selected,
  onSelect,
}: {
  doc: SaleDoc;
  selected: boolean;
  onSelect: (d: SaleDoc) => void;
}) {
  const leftCls = KANBAN_CARD_LEFT[doc.status] ?? "border-l-gray-300";

  return (
    <div
      onClick={() => onSelect(doc)}
      className={`rounded-lg border-l-4 bg-white p-3 text-sm cursor-pointer transition-all hover:shadow-md ${leftCls} ${
        selected
          ? "shadow-md ring-2 ring-brand/30 ring-offset-0"
          : "shadow-sm hover:shadow"
      } border border-[#e2e8f0]`}
    >
      {/* Customer */}
      <div className="font-semibold text-gray-800 truncate mb-1 leading-tight">
        {doc.customer_name || "—"}
      </div>

      {/* Amount — prominent */}
      <div className="text-base font-bold text-gray-900 tabular-nums leading-tight">
        {fmtMoney(doc.total_amount_mdl)}
        <span className="text-xs font-normal text-gray-400 ml-1">MDL</span>
      </div>

      {/* Bottom row: doc number + date */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="font-mono text-[10px] text-gray-400 truncate">{doc.doc_number}</div>
        {doc.doc_date && (
          <div className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0">
            <Calendar className="w-3 h-3" />
            {fmtDate(doc.doc_date)}
          </div>
        )}
      </div>

      {/* Type badge — only if non-default */}
      {doc.sale_type && doc.sale_type !== "domestic" && (
        <div className="mt-1.5">
          <TypeBadge type={doc.sale_type} />
        </div>
      )}
    </div>
  );
}

interface Props { customerId?: number; compact?: boolean; }

export default function SalesTable({ customerId, compact = false }: Props) {
  const t = useT();
  const [docs, setDocs]             = useState<SaleDoc[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [dateFrom, setFrom]         = useState("");
  const [dateTo, setTo]             = useState("");
  const [status, setStatus]         = useState("all");
  const [saleType, setType]         = useState("all");
  const [view, setView]             = useState<"list" | "kanban">("list");
  const [selectedDoc, setSelectedDoc] = useState<SaleDoc | null>(null);

  const fetchDocs = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (dateFrom)   params.set("from", dateFrom);
    if (dateTo)     params.set("to", dateTo);
    if (customerId) params.set("customer_id", String(customerId));
    if (status   !== "all") params.set("status",    status);
    if (saleType !== "all") params.set("sale_type", saleType);
    params.set("page", String(p));
    const res  = await fetch(`/api/sales?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError((data as { error?: string }).error ?? t("common.error")); }
    else {
      const d = data as { docs: SaleDoc[]; total: number; page: number; pages: number; status_counts: Record<string, number> };
      setDocs(d.docs);
      setTotal(d.total);
      setPage(d.page);
      setPages(d.pages);
      setStatusCounts(d.status_counts ?? {});
    }
    setLoading(false);
  }, [dateFrom, dateTo, customerId, status, saleType, t]);

  useEffect(() => { setPage(1); fetchDocs(1); }, [fetchDocs]);
  function goToPage(p: number) { setPage(p); fetchDocs(p); }

  function handleStatusChange(id: number, newStatus: string) {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
    setSelectedDoc(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? docs.filter((d) =>
          d.doc_number.toLowerCase().includes(q) ||
          d.customer_name.toLowerCase().includes(q))
      : docs;
  }, [docs, search]);

  const stats = useMemo(() => ({
    count:      filtered.length,
    amount_mdl: filtered.reduce((s, d) => s + d.total_amount_mdl, 0),
    kg:         filtered.reduce((s, d) => s + d.total_net_kg, 0),
  }), [filtered]);

  function exportCsv(rows: SaleDoc[]) {
    const headers = [
      t("sales.docNum"), t("sales.docDate"), t("sales.customer"),
      t("common.type"), t("common.status"), t("common.currency"),
      t("common.amount"), `${t("common.amount")} MDL`,
      t("sales.netKg"),
    ];
    const data = rows.map((r) => [
      r.doc_number, fmtDate(r.doc_date), r.customer_name,
      t(`sales.types.${r.sale_type}`) || r.sale_type,
      t(`sales.statuses.${r.status}`) || r.status,
      r.currency_code || "MDL",
      r.total_amount.toFixed(2).replace(".", ","),
      r.total_amount_mdl.toFixed(2).replace(".", ","),
      r.total_net_kg.toFixed(2).replace(".", ","),
    ]);
    const csv = [headers, ...data]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const STATUS_TABS = [
    { v: "all",       label: t("common.all"),                count: total },
    { v: "confirmed", label: t("sales.statuses.confirmed"),  count: statusCounts.confirmed  ?? 0 },
    { v: "shipped",   label: t("sales.statuses.shipped"),    count: statusCounts.shipped    ?? 0 },
    { v: "delivered", label: t("sales.statuses.delivered"),  count: statusCounts.delivered  ?? 0 },
    { v: "closed",    label: t("sales.statuses.closed"),     count: statusCounts.closed     ?? 0 },
    { v: "draft",     label: t("sales.statuses.draft"),      count: statusCounts.draft      ?? 0 },
    { v: "cancelled", label: t("sales.statuses.cancelled"),  count: statusCounts.cancelled  ?? 0 },
  ];

  const colSpan = customerId ? 8 : 9;

  return (
    <div className={compact ? "" : ""}>
      {/* Header */}
      {!compact && (
        <div className="px-4 sm:px-8 pt-6 pb-4 border-b border-[#c8d3e8] flex items-start justify-between gap-4 flex-col sm:flex-row">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("sales.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("sales.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[#c8d3e8] overflow-hidden">
              <button
                onClick={() => setView("list")}
                className={`p-2 transition ${view === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                title={t("sales.viewList")}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("kanban")}
                className={`p-2 transition ${view === "kanban" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                title={t("sales.viewKanban")}
              >
                <Columns3 className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => exportCsv(filtered)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#c8d3e8] text-sm hover:bg-gray-50 transition text-gray-700"
            >
              <FileDown className="w-4 h-4" />
              {t("common.export")} CSV
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={`flex flex-wrap gap-3 items-end ${compact ? "mb-4" : "px-4 sm:px-8 py-4 border-b border-[#c8d3e8]"}`}>
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button key={s.v} onClick={() => setStatus(s.v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm transition
                ${status === s.v
                  ? "border-brand/40 bg-brand/10 text-brand font-medium"
                  : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}>
              {s.label} <span className="tabular-nums text-xs opacity-70">{s.count}</span>
            </button>
          ))}
        </div>

        <select value={saleType} onChange={(e) => setType(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition">
          <option value="all">{t("sales.allTypes")}</option>
          <option value="domestic">{t("sales.types.domestic")}</option>
          <option value="export">{t("sales.types.export")}</option>
        </select>

        <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition" />
        <span className="text-gray-400 text-sm self-center">—</span>
        <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)}
          className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-gray-400 hover:text-gray-700">✕</button>
        )}

        {!customerId && (
          <input type="text" placeholder={t("sales.searchPlaceholder")} value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-[#c8d3e8] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand transition w-full sm:w-56" />
        )}
      </div>

      {/* Stat cards */}
      {!compact && (
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${view === "list" ? "px-4 sm:px-8 py-4" : "px-4 sm:px-8 pt-4"}`}>
          <StatCard label={t("sales.docs")}              value={String(stats.count)} />
          <StatCard label={`${t("common.amount")} (MDL)`} value={fmtMoney(stats.amount_mdl)} suffix="MDL" />
          <StatCard label={t("sales.netKg")}              value={fmtKg(stats.kg)} />
        </div>
      )}

      {/* Kanban view */}
      {view === "kanban" && !loading && (
        <div className="flex items-stretch mx-4 sm:mx-8 mb-6">
          {/* Kanban scroll area */}
          <div className="flex-1 min-w-0 overflow-auto py-4 bg-[#f4f6fb] rounded-2xl">
            <div className="flex gap-3 pb-2 pt-1 flex-wrap">
              {KANBAN_STATUSES.map(col => {
                const cards = filtered.filter(d => d.status === col);
                const colTotal = cards.reduce((s, d) => s + d.total_amount_mdl, 0);
                const colors = KANBAN_COLORS[col];
                return (
                  <div key={col} className="flex flex-col flex-1 min-w-52">
                    {/* Column header */}
                    <div className="rounded-xl bg-white border border-[#e2e8f0] shadow-sm mb-2 overflow-hidden">
                      <div className={`h-1 w-full ${colors.bar}`} />
                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-semibold ${colors.text}`}>
                            {t(`sales.statuses.${col}`)}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.bar} text-white`}>
                            {cards.length}
                          </span>
                        </div>
                        {cards.length > 0 && (
                          <div className="text-xs text-gray-400 font-mono mt-0.5">
                            {fmtMoney(colTotal)} MDL
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Cards */}
                    <div className="flex flex-col gap-2 min-h-24">
                      {cards.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#d1d9e8] py-8 text-center text-xs text-gray-300">
                          пусто
                        </div>
                      ) : (
                        cards.map(d => (
                          <KanbanCard
                            key={d.id}
                            doc={d}
                            selected={selectedDoc?.id === d.id}
                            onSelect={setSelectedDoc}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel — overlay on mobile, side panel on desktop */}
          {selectedDoc && (
            <>
              <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedDoc(null)} />
              <div className="fixed inset-y-0 right-0 z-50 md:relative md:inset-auto md:z-auto shrink-0 md:sticky md:top-0 md:self-start">
                <DealPanel
                  doc={selectedDoc}
                  onClose={() => setSelectedDoc(null)}
                  onStatusChange={handleStatusChange}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* List view */}
      {(view === "list" || loading) && (
        <div className={compact ? "" : "px-4 sm:px-8 pb-8"}>
          <div className="border border-[#c8d3e8] rounded-xl overflow-auto bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№ {t("sales.docNum").toUpperCase()}</TableHead>
                  <TableHead>{t("sales.docDate").toUpperCase()}</TableHead>
                  {!customerId && <TableHead>{t("sales.customer").toUpperCase()}</TableHead>}
                  <TableHead className="hidden md:table-cell">{t("common.type").toUpperCase()}</TableHead>
                  <TableHead>{t("common.status").toUpperCase()}</TableHead>
                  <TableHead className="text-center">{t("common.amount").toUpperCase()}</TableHead>
                  <TableHead className="hidden sm:table-cell text-center">{t("sales.netKg").toUpperCase()}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colSpan} className="text-center text-gray-400 py-8">{t("common.loading")}</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={colSpan} className="text-center text-red-500 py-8">{error}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colSpan} className="text-center text-gray-400 py-8">{t("sales.noSales")}</TableCell></TableRow>
                ) : filtered.map((d) => (
                  <TableRow key={d.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                    <TableCell className="tabular-nums">{fmtDate(d.doc_date)}</TableCell>
                    {!customerId && (
                      <TableCell>
                        {d.customer_id
                          ? <Link href={`/customers/${d.customer_id}`} className="transition underline underline-offset-2 decoration-gray-300 hover:text-gray-900">{d.customer_name}</Link>
                          : d.customer_name || "—"}
                      </TableCell>
                    )}
                    <TableCell className="hidden md:table-cell"><TypeBadge type={d.sale_type} /></TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell className="text-center font-mono tabular-nums">
                      <div>{fmtMoney(d.total_amount)} {d.currency_code || "MDL"}</div>
                      {d.currency_code && d.currency_code !== "MDL" && (
                        <div className="text-sm text-gray-400">≈ {fmtMoney(d.total_amount_mdl)} MDL</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-center font-mono tabular-nums">{fmtKg(d.total_net_kg)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => downloadPdf(d.id, d.doc_number)}
                          title="PDF (накладная)"
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                          <FileDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => downloadFiscalInvoice(d.id, d.doc_number)}
                          title="Счёт-фактура"
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                          <Receipt className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!loading && total > 0 && (
            <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm text-gray-400">
                {t("common.showing")}: {filtered.length} / {total} — {t("common.amount")}: {fmtMoney(stats.amount_mdl)} MDL — {fmtKg(stats.kg)} кг
              </div>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    className="px-2 py-1 rounded border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                  >←</button>
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…"
                        ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                        : <button key={p}
                            onClick={() => goToPage(p as number)}
                            className={`px-2.5 py-1 rounded border text-sm transition ${
                              page === p ? "bg-gray-900 border-gray-700 text-white" : "border-[#c8d3e8] text-gray-500 hover:bg-gray-100"
                            }`}
                          >{p}</button>
                    )
                  }
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= pages}
                    className="px-2 py-1 rounded border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                  >→</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 bg-white">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums text-gray-900">
        {value}{suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
