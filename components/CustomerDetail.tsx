/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import SalesTable from "@/components/SalesTable";
import ActivityTimeline from "@/components/ActivityTimeline";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { useT, useLocale } from "@/lib/locale";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";
import TasksPage from "@/components/TasksPage";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface AppUser {
  id: number; telegram_chat_id: number;
  telegram_username: string | null;
  first_name: string | null; last_name: string | null;
  status: string; first_seen: string | null; last_seen: string | null;
}

interface Binding {
  id: number; invite_token: string; status: string;
  created_at: string | null; expires_at: string | null; bound_at: string | null;
}

interface CustomerDetail {
  id: number; code: string; name: string;
  country: string | null; tax_id: string | null;
  contact_phone: string | null; contact_email: string | null;
  address: string | null; customer_type: string | null;
  active: boolean; created_at: string | null;
  AGRO_CRM_APP_USERS: AppUser[]; bindings: Binding[];
}

interface CustomerStats {
  total_revenue: number; total_net_kg: number;
  order_count: number; avg_check: number;
  last_order_date: string | null; first_order_date: string | null;
  avg_days_between: number | null; days_since_last: number | null;
  next_order_expected: string | null; overdue_days: number | null;
  churn_pct: number | null; churn_cur: number; churn_prv: number;
  monthly: { month: string; revenue: number; orders: number }[];
}

type Tab = "info" | "sales" | "activities" | "tasks" | "files" | "telegram" | "nps" | "batches" | "loyalty";

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function shortToken(t: string) { return `${t.slice(0, 8)}…${t.slice(-4)}`; }

function fmtMonthLabel(s: string, locale: string) {
  const [y, m] = s.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
}

const ttStyle = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#d4d4d8" },
  itemStyle:    { color: "#a1a1aa" },
};

function RetentionBlock({ stats }: { stats: CustomerStats }) {
  const t = useT();
  const { locale } = useLocale();
  const { days_since_last, avg_days_between, next_order_expected, overdue_days, order_count, total_revenue, avg_check } = stats;

  let daysColor = "text-emerald-400";
  if (days_since_last !== null && avg_days_between !== null) {
    if (days_since_last > avg_days_between * 1.5) daysColor = "text-red-400";
    else if (days_since_last > avg_days_between)  daysColor = "text-amber-400";
  }

  function fmtD(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <section className="border border-[#c8d3e8] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">{t("customers.retention.title")}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="border border-[#c8d3e8] rounded-xl p-3">
          <div className="text-sm text-gray-400 mb-1">{t("customers.ltv")}</div>
          <div className="text-lg font-bold text-gray-800 tabular-nums">
            {total_revenue.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-gray-400">MDL</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-3">
          <div className="text-sm text-gray-400 mb-1">{t("customers.retention.avgCheck")}</div>
          <div className="text-lg font-bold text-gray-800 tabular-nums">
            {avg_check.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-gray-400">MDL · {order_count} {t("customers.ordersCount").toLowerCase()}</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-3">
          <div className="text-sm text-gray-400 mb-1">{t("customers.retention.daysSinceLast")}</div>
          <div className={`text-lg font-bold tabular-nums ${daysColor}`}>
            {days_since_last !== null ? days_since_last : "—"}
          </div>
          <div className="text-[10px] text-gray-400">
            {avg_days_between !== null
              ? `${t("customers.retention.cycle")}${avg_days_between} ${t("common.days")}`
              : t("customers.retention.unknownCycle")}
          </div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-3">
          <div className="text-sm text-gray-400 mb-1">{t("customers.retention.nextOrder")}</div>
          <div className="text-sm font-semibold text-gray-800">{fmtD(next_order_expected)}</div>
          {overdue_days !== null && overdue_days > 0 ? (
            <div className="text-[10px] text-red-400 mt-0.5">
              {t("customers.retention.overdue")} {overdue_days} {t("common.days")}
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 mt-0.5">{t("customers.retention.forecast")}</div>
          )}
        </div>
      </div>

      {overdue_days !== null && overdue_days > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/30 bg-red-500/8 text-sm text-red-300">
          <span>⚠️</span>
          <span>
            {t("customers.retention.warningNotBought")} <strong>{days_since_last} {t("common.days")}</strong>{" "}
            {t("customers.retention.warningExpected")} <strong>{avg_days_between} {t("common.days")}</strong>.{" "}
            {t("customers.retention.warningOverdue")} <strong>{overdue_days} {t("common.days")}</strong>
          </span>
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-sm text-gray-400">{label}</div>
      <div className="mt-0.5">{value && String(value).trim() !== "" ? value : "—"}</div>
    </div>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 text-center">
      <div className={`text-xl font-bold tabular-nums ${highlight ?? ""}`}>{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function BindingStatus({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "border-[#c8d3e8] text-gray-500",
    bound:   "border-emerald-400 text-emerald-600",
    revoked: "border-red-300 text-red-500",
    expired: "border-orange-400 text-orange-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm border ${map[s] ?? "border-[#c8d3e8] text-gray-500"}`}>
      {s}
    </span>
  );
}

export default function CustomerDetail({ id }: { id: string }) {
  const t       = useT();
  const confirm = useConfirm();
  const { locale } = useLocale();
  const [data, setData]               = useState<CustomerDetail | null>(null);
  const [stats, setStats]             = useState<CustomerStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<Tab>("info");
  const [newLink, setNewLink]         = useState<string | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [aiSummary, setAiSummary]     = useState<string | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]         = useState(false);
  const router                        = useRouter();

  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string; country: string; tax_id: string;
    contact_phone: string; contact_email: string;
    address: string; customer_type: string;
  } | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    if (!data) return;
    setEditForm({
      name:          data.name          ?? "",
      country:       data.country       ?? "",
      tax_id:        data.tax_id        ?? "",
      contact_phone: data.contact_phone ?? "",
      contact_email: data.contact_email ?? "",
      address:       data.address       ?? "",
      customer_type: data.customer_type ?? "domestic",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editForm) return;
    setSaving(true); setSaveError(null);
    const res  = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const json = await res.json().catch(() => ({})) as { error?: string };
    setSaving(false);
    if (!res.ok) { setSaveError(json.error ?? t("common.error")); return; }
    setEditing(false);
    fetchData();
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [res, sRes] = await Promise.all([
      fetch(`/api/customers/${id}`),
      fetch(`/api/customers/${id}/stats`),
    ]);
    const json  = await res.json().catch(() => ({}));
    const sJson = await sRes.json().catch(() => ({}));
    if (!res.ok) setError((json as { error?: string }).error ?? t("common.error"));
    else {
      setData(json as CustomerDetail);
      if (sRes.ok) setStats(sJson as CustomerStats);
    }
    setLoading(false);
  }, [id, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then((d: unknown) => {
        const p = d as { username?: string; role?: string };
        if (p?.username) setCurrentUser(p.username);
        if (p?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  async function analyzeCustomer() {
    setAiLoading(true); setAiSummary(null);
    const res  = await fetch("/api/ai/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: Number(id) }),
    });
    const json = await res.json().catch(() => ({})) as { summary?: string; error?: string };
    setAiLoading(false);
    setAiSummary(json.summary ?? json.error ?? t("common.error"));
  }

  async function generateLink() {
    setGenerating(true); setNewLink(null);
    const res  = await fetch(`/api/customers/${id}/invite-link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_days: 7 }),
    });
    const json = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { toast.error((json as { error?: string }).error ?? t("common.error")); return; }
    setNewLink((json as { url: string }).url);
    fetchData();
  }

  async function revokeBinding(bindingId: number) {
    if (!await confirm({ message: t("customers.tg.revokeConfirm"), danger: true })) return;
    const res = await fetch(`/api/customers/${id}/invite-link`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ binding_id: bindingId }),
    });
    if (!res.ok) { toast.error(t("common.error")); return; }
    fetchData();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Скопировано"), () => toast.error(t("common.error")));
  }

  async function deleteCustomer(soft: boolean) {
    if (!data) return;
    if (!await confirm({ message: `${soft ? t("customers.deactivate") : t("customers.deleteButton")} «${data.name}»?`, danger: true })) return;
    setDeleting(true);
    const res  = await fetch(`/api/customers/${id}${soft ? "?soft=1" : ""}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({} as { error?: string; code?: string }));
    setDeleting(false);
    if (res.ok) { router.push("/customers"); return; }
    if (!soft && (json as { code?: string }).code === "HAS_DEPENDENCIES") {
      if (await confirm({ message: `${(json as { error?: string }).error ?? t("customers.hasDepsTitle")}\n\n${t("customers.deactivate")}?`, danger: false, confirmLabel: t("customers.deactivate") })) deleteCustomer(true);
      return;
    }
    toast.error((json as { error?: string }).error ?? t("common.error"));
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error)   return <div className="p-8 text-sm text-red-500">{error}</div>;
  if (!data)   return null;

  const churnPct   = stats?.churn_pct ?? null;
  const churnColor = churnPct === null ? null
    : churnPct <= -50 ? "text-red-400"
    : churnPct <= -20 ? "text-amber-400"
    : churnPct < 0    ? "text-yellow-400"
    : "text-emerald-400";

  const fmtMonthL = (s: string) => fmtMonthLabel(s, locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB");

  const TABS: { key: Tab; label: string }[] = [
    { key: "info",       label: t("customers.tabs.info") },
    { key: "sales",      label: `${t("customers.tabs.sales")}${stats ? ` (${stats.order_count})` : ""}` },
    { key: "activities", label: t("customers.tabs.activities") },
    { key: "tasks",      label: t("customers.tabs.tasks") },
    { key: "files",      label: t("customers.tabs.files") },
    { key: "telegram",   label: "Telegram" },
    { key: "nps",        label: "NPS" },
    { key: "batches",      label: t("customers.tabs.batches") },
{ key: "loyalty",      label: "Лояльность" },
  ];

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <Link href="/customers" className="text-sm text-gray-400 hover:text-gray-700 transition">
        {t("customers.backToList")}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{data.code}
            {!data.active && <span className="ml-2 text-amber-500">({t("customers.deactivated")})</span>}
          </p>
        </div>
        {stats && stats.order_count > 0 && (
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-lg font-bold tabular-nums">{fmtMoney(stats.total_revenue)}</div>
              <div className="text-sm text-gray-400">LTV (MDL)</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{stats.order_count}</div>
              <div className="text-sm text-gray-400">{t("customers.ordersCount")}</div>
            </div>
            <div>
              <div className={`text-lg font-bold tabular-nums ${churnColor ?? ""}`}>
                {churnPct !== null ? `${churnPct > 0 ? "+" : ""}${churnPct}%` : "—"}
              </div>
              <div className="text-sm text-gray-400">{t("customers.dynamics30")}</div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: dropdown */}
      <select
        className="sm:hidden w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
        value={tab}
        onChange={(e) => setTab(e.target.value as Tab)}
      >
        {TABS.map((tb) => (
          <option key={tb.key} value={tb.key}>{tb.label}</option>
        ))}
      </select>

      {/* Desktop: tab bar */}
      <div className="hidden sm:flex gap-1 border-b border-[#c8d3e8] pb-0">
        {TABS.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm transition border-b-2 -mb-px whitespace-nowrap ${
              tab === tb.key ? "border-[#c8d3e8] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-6">
          <section className="border border-[#c8d3e8] rounded-xl p-5 text-sm space-y-4">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("customers.details")}</span>
              {!editing ? (
                <button onClick={startEdit}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition">
                  ✏️ {t("common.edit")}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">
                    {t("common.cancel")}
                  </button>
                  <button onClick={saveEdit} disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition disabled:opacity-50">
                    {saving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-red-500">{saveError}</p>}

            {/* View mode */}
            {!editing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <Field label={t("common.type")}             value={data.customer_type} />
                <Field label={t("common.country")}          value={data.country} />
                <Field label="Tax ID"                       value={data.tax_id} />
                <Field label={t("customers.contactPhone")}  value={data.contact_phone} />
                <Field label={t("customers.contactEmail")}  value={data.contact_email} />
                <Field label={t("customers.active")}        value={data.active ? t("common.yes") : t("common.no")} />
                <div className="md:col-span-2"><Field label={t("customers.address")} value={data.address} /></div>
              </div>
            )}

            {/* Edit mode */}
            {editing && editForm && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs text-gray-500">{t("customers.name")}</label>
                  <input value={editForm.name}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("common.type")}</label>
                  <select value={editForm.customer_type}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, customer_type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600 bg-white">
                    <option value="domestic">domestic</option>
                    <option value="export">export</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("common.country")}</label>
                  <input value={editForm.country}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, country: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Tax ID</label>
                  <input value={editForm.tax_id}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, tax_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("customers.contactPhone")}</label>
                  <input value={editForm.contact_phone}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, contact_phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("customers.contactEmail")}</label>
                  <input value={editForm.contact_email}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, contact_email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs text-gray-500">{t("customers.address")}</label>
                  <input value={editForm.address}
                    onChange={(e) => setEditForm((f) => f && ({ ...f, address: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-600" />
                </div>
              </div>
            )}
          </section>

          {stats && stats.order_count > 0 && <RetentionBlock stats={stats} />}

          <section className="border border-[#c8d3e8] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">✨ {t("customers.aiAnalysis")}</h2>
              <button
                onClick={analyzeCustomer}
                disabled={aiLoading}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition"
              >
                {aiLoading ? t("customers.aiAnalyzing") : t("customers.aiAnalyze")}
              </button>
            </div>
            {aiSummary && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
            )}
            {!aiSummary && !aiLoading && (
              <p className="text-sm text-gray-400">{t("customers.aiAnalysis")} — нажмите кнопку для анализа</p>
            )}
          </section>

          <section className="border border-red-500/30 rounded-xl p-5">
            <h2 className="text-base font-semibold text-red-300 mb-1">{t("customers.dangerZone")}</h2>
            <p className="text-sm text-gray-400 mb-4">{t("customers.dangerZoneDesc")}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => deleteCustomer(false)} disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition">
                {deleting ? t("customers.deletingBtn") : t("customers.deleteButton")}
              </button>
              {data.active && (
                <button onClick={() => deleteCustomer(true)} disabled={deleting}
                  className="px-4 py-2 text-sm rounded-lg border border-[#c8d3e8] hover:bg-gray-100 text-gray-700 disabled:opacity-50 transition">
                  {t("customers.deactivate")}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "sales" && (
        <div className="space-y-6">
          {stats && stats.order_count > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="LTV"                           value={`${fmtMoney(stats.total_revenue)} MDL`} />
              <KpiCard label={t("customers.retention.avgCheck")}  value={`${fmtMoney(stats.avg_check)} MDL`} />
              <KpiCard label={t("customers.firstOrder")}    value={fmtDateShort(stats.first_order_date)} />
              <KpiCard label={t("customers.stats.lastOrder")} value={fmtDateShort(stats.last_order_date)} />
              <KpiCard label={t("customers.allOrders")}     value={String(stats.order_count)} />
              <KpiCard label={t("customers.totalKg")}       value={`${stats.total_net_kg.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} кг`} />
              <KpiCard label={t("customers.avgInterval")}   value={stats.avg_days_between !== null ? `${stats.avg_days_between} ${t("common.days")}` : "—"} />
              <KpiCard label={t("customers.dynamics30")}
                value={churnPct !== null ? `${churnPct > 0 ? "+" : ""}${churnPct}%` : "—"}
                highlight={churnColor ?? undefined} />
            </div>
          )}

          {stats && stats.monthly.length > 0 && (
            <div className="border border-[#c8d3e8] rounded-xl p-5">
              <div className="text-sm font-medium mb-4">{t("customers.revenueChartTitle")}</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.monthly} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <XAxis dataKey="month" tickFormatter={fmtMonthL} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip {...ttStyle}
                    formatter={(v: unknown) => [`${fmtMoney(Number(v ?? 0))} MDL`, t("dashboard.revenueLabel")]}
                    labelFormatter={(s: unknown) => fmtMonthL(String(s ?? ""))} />
                  <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                    {stats.monthly.map((_, i) => (
                      <Cell key={i} fill={i === stats.monthly.length - 1 ? "#3b82f6" : "#d1d5db"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <SalesTable customerId={data.id} compact />

          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Цены по товарам</h3>
            <PriceListTab customerId={data.id} />
          </div>
        </div>
      )}

      {tab === "activities" && (
        <ActivityTimeline customerId={data.id} currentUser={currentUser ?? undefined} isAdmin={isAdmin} />
      )}

      {tab === "tasks" && (
        <TasksPage customerId={data.id} compact />
      )}

      {tab === "files" && (
        <AttachmentsPanel entityType="customer" entityId={data.id} currentUser={currentUser ?? undefined} isAdmin={isAdmin} />
      )}

      {tab === "telegram" && (
        <section className="border border-[#c8d3e8] rounded-xl p-5 space-y-4">
          {data.AGRO_CRM_APP_USERS.length > 0 ? (
            <div className="space-y-3">
              {data.AGRO_CRM_APP_USERS.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 border border-emerald-500/20 bg-emerald-500/5 rounded-lg px-4 py-3">
                  <div className="text-sm">
                    <div>
                      <span className="text-emerald-300 mr-2">{t("customers.tg.linked")}</span>
                      {u.telegram_username ? <span className="font-mono">@{u.telegram_username}</span> : null}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      chat_id: <span className="font-mono">{u.telegram_chat_id}</span>
                      {" · "}{t("appUsers.firstSeen")}: {fmtDate(u.first_seen)}
                      {" · "}{t("appUsers.lastSeen")}: {fmtDate(u.last_seen)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("customers.tg.notLinked")}</p>
          )}

          <div className="flex items-center gap-3">
            <button onClick={generateLink} disabled={generating}
              className="px-4 py-2 text-sm rounded-lg border border-[#c8d3e8] bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition">
              {generating ? t("customers.tg.creating") : t("customers.tg.createInvite")}
            </button>
            <span className="text-sm text-gray-500">{t("customers.tg.ttl")}</span>
          </div>

          {newLink && (
            <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
              <code className="break-all text-emerald-200">{newLink}</code>
              <button onClick={() => copy(newLink)}
                className="px-3 py-1 text-sm rounded-md border border-emerald-400/40 hover:bg-emerald-500/20 shrink-0">
                {t("common.copy")}
              </button>
            </div>
          )}

          {data.bindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("customers.tg.history")}</h3>
              <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("customers.tg.token").toUpperCase()}</TableHead>
                      <TableHead>{t("common.status").toUpperCase()}</TableHead>
                      <TableHead>{t("customers.tg.created").toUpperCase()}</TableHead>
                      <TableHead>{t("customers.tg.expires").toUpperCase()}</TableHead>
                      <TableHead>{t("customers.tg.bound").toUpperCase()}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bindings.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm">{shortToken(b.invite_token)}</TableCell>
                        <TableCell><BindingStatus s={b.status} /></TableCell>
                        <TableCell>{fmtDate(b.created_at)}</TableCell>
                        <TableCell>{fmtDate(b.expires_at)}</TableCell>
                        <TableCell>{fmtDate(b.bound_at)}</TableCell>
                        <TableCell className="text-center">
                          {b.status === "pending" && (
                            <button onClick={() => revokeBinding(b.id)}
                              className="px-2 py-1 text-sm rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition">
                              {t("customers.tg.revoke")}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "nps" && data && (
        <NpsWidget customerId={data.id} />
      )}

      {tab === "batches" && data && (
        <BatchesTab customerId={data.id} />
      )}

{tab === "loyalty" && data && (
        <LoyaltyTab customerId={data.id} />
      )}
    </div>
  );
}

// ─── NPS Widget ───────────────────────────────────────────────────────────────

interface NpsRating { id: number; score: number; comment: string | null; created_by: string | null; created_at: string | null; }
interface NpsData { avg: number | null; count: number; ratings: NpsRating[]; }

function NpsWidget({ customerId }: { customerId: number }) {
  const [data, setData]       = useState<NpsData | null>(null);
  const [score, setScore]     = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/nps?customer_id=${customerId}`);
    if (res.ok) setData(await res.json() as NpsData);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!score) return;
    setSaving(true);
    await fetch("/api/nps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, score, comment: comment || null }),
    });
    setSaving(false);
    setSaved(true);
    setScore(null);
    setComment("");
    setTimeout(() => setSaved(false), 3000);
    load();
  }

  function fmtDt(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function ScoreColor(n: number) {
    if (n >= 9) return "text-emerald-500";
    if (n >= 7) return "text-amber-400";
    return "text-red-400";
  }

  return (
    <section className="border border-[#c8d3e8] rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-gray-700">NPS / Удовлетворённость</h2>
        {data && data.avg !== null && (
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${ScoreColor(data.avg)}`}>{data.avg}</span>
            <span className="text-xs text-gray-400">/ 10 · {data.count} оценок</span>
          </div>
        )}
      </div>

      {/* Score input */}
      <div>
        <p className="text-sm text-gray-500 mb-2">Добавить оценку</p>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button
              key={n}
              onClick={() => setScore(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold border transition
                ${score === n
                  ? n >= 9 ? "bg-emerald-500 border-emerald-500 text-white"
                    : n >= 7 ? "bg-amber-400 border-amber-400 text-white"
                    : "bg-red-400 border-red-400 text-white"
                  : "border-[#c8d3e8] text-gray-600 hover:bg-gray-100"
                }`}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Комментарий (необязательно)..."
          rows={2}
          className="w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none resize-none mb-2"
        />
        <button
          onClick={submit}
          disabled={!score || saving}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {saving ? "Сохранение..." : saved ? "✓ Сохранено" : "Сохранить оценку"}
        </button>
      </div>

      {/* History */}
      {data && data.ratings.length > 0 && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">История оценок</p>
          {data.ratings.map(r => (
            <div key={r.id} className="flex items-start gap-3 py-2 border-b border-gray-50">
              <span className={`text-lg font-bold w-8 text-center shrink-0 ${ScoreColor(r.score)}`}>{r.score}</span>
              <div className="flex-1 min-w-0">
                {r.comment && <p className="text-sm text-gray-700">{r.comment}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {r.created_by && <span>{r.created_by} · </span>}
                  {fmtDt(r.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.count === 0 && (
        <p className="text-sm text-gray-400">Оценок пока нет. Добавьте первую.</p>
      )}
    </section>
  );
}

// ─── Batches Tab ──────────────────────────────────────────────────────────────

interface BatchItem {
  doc_number: string; doc_date: string | null;
  batch_number: string; item_name: string;
  qty_kg: number; expiry_date: string | null;
  batch_status: string; sales_doc_id: number;
}

const BATCH_STATUS_CLS: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-600",
  blocked:  "bg-red-50 text-red-500",
  expired:  "bg-gray-100 text-gray-500",
  consumed: "bg-gray-50 text-gray-400",
};

function BatchesTab({ customerId }: { customerId: number }) {
  const t = useT();
  const [rows, setRows]     = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/batches`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: BatchItem[]) => setRows(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  function fmtD(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function expiryClass(s: string | null) {
    if (!s) return "";
    const days = (new Date(s).getTime() - Date.now()) / 86400000;
    if (days < 0)  return "text-gray-400 line-through";
    if (days < 14) return "text-red-500 font-semibold";
    if (days < 30) return "text-amber-500";
    return "text-gray-700";
  }

  if (loading) return <div className="py-8 text-sm text-gray-400 text-center">{t("common.loading")}</div>;

  return (
    <section className="border border-[#c8d3e8] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#c8d3e8] bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("batches.title")}</h2>
        <span className="text-xs text-gray-400">{rows.length} лотов</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">{t("batches.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("batches.docNumber").toUpperCase()}</TableHead>
                <TableHead>{t("batches.docDate").toUpperCase()}</TableHead>
                <TableHead>{t("batches.batchNumber").toUpperCase()}</TableHead>
                <TableHead>{t("batches.itemName").toUpperCase()}</TableHead>
                <TableHead className="text-right">{t("batches.qty").toUpperCase()}</TableHead>
                <TableHead>{t("batches.expiry").toUpperCase()}</TableHead>
                <TableHead>{t("batches.status").toUpperCase()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs text-gray-600">{r.doc_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtD(r.doc_date)}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{r.batch_number}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.qty_kg.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
                  </TableCell>
                  <TableCell className={`whitespace-nowrap ${expiryClass(r.expiry_date)}`}>
                    {fmtD(r.expiry_date)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${BATCH_STATUS_CLS[r.batch_status] ?? "bg-gray-100 text-gray-500"}`}>
                      {t(`batches.status${r.batch_status.charAt(0).toUpperCase()}${r.batch_status.slice(1)}`) || r.batch_status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

// ─── Price List Tab ───────────────────────────────────────────────────────────

interface PriceRow {
  item_id: number; item_name: string; unit: string;
  min_price: number; max_price: number; avg_price: number;
  total_kg: number; orders: number; last_date: string;
}

function PriceListTab({ customerId }: { customerId: number }) {
  const [rows, setRows]     = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/pricelist`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setRows(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [customerId]);

  const fmt  = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  const fmtDate = (s: string) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (loading) return <div className="text-gray-400 text-sm py-6 text-center">Загрузка...</div>;
  if (!rows.length) return <div className="text-gray-400 text-sm py-6 text-center">Нет данных о закупках</div>;

  return (
    <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-xs text-gray-500 font-semibold">Товар</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold text-right">Мин. цена</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold text-right">Сред. цена</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold text-right">Макс. цена</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold text-right">Итого кг</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold text-center">Заказов</TableHead>
            <TableHead className="text-xs text-gray-500 font-semibold">Последняя покупка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.item_id} className="hover:bg-gray-50/50">
              <TableCell className="font-medium text-gray-800">{r.item_name}</TableCell>
              <TableCell className="text-right tabular-nums text-gray-600">{fmt(r.min_price)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-[#516895]">{fmt(r.avg_price)}</TableCell>
              <TableCell className="text-right tabular-nums text-gray-600">{fmt(r.max_price)}</TableCell>
              <TableCell className="text-right tabular-nums text-gray-700">{fmtKg(r.total_kg)} {r.unit}</TableCell>
              <TableCell className="text-center text-gray-500">{r.orders}</TableCell>
              <TableCell className="text-gray-400 text-sm">{fmtDate(r.last_date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Loyalty Tab ──────────────────────────────────────────────────────────────

interface LoyaltyProfile {
  enrolled: boolean;
  member_id?: number;
  total_points?: number;
  tier_name?: string | null;
  tier_color?: string | null;
  enrolled_at?: string | null;
  transactions?: {
    id: number; points: number; tx_type: string | null;
    description: string | null; created_at: string | null;
  }[];
}

const TIER_STYLE: Record<string, string> = {
  amber:  "bg-amber-100  text-amber-800  border-amber-300",
  slate:  "bg-slate-100  text-slate-700  border-slate-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  cyan:   "bg-cyan-100   text-cyan-800   border-cyan-300",
  gray:   "bg-gray-100   text-gray-600   border-gray-300",
};

function LoyaltyTab({ customerId }: { customerId: number }) {
  const [profile, setProfile]         = useState<LoyaltyProfile | null>(null);
  const [loading, setLoading]         = useState(true);
  const [enrolling, setEnrolling]     = useState(false);
  const [awardPoints, setAwardPoints] = useState("");
  const [awardDesc, setAwardDesc]     = useState("");
  const [awarding, setAwarding]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/loyalty/${customerId}`);
    if (res.ok) setProfile(await res.json() as LoyaltyProfile);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function handleEnroll() {
    setEnrolling(true);
    const res = await fetch("/api/loyalty/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    setEnrolling(false);
    if (res.ok) { toast.success("Клиент записан в программу лояльности"); load(); }
    else { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); }
  }

  async function handleAward() {
    const pts = Number(awardPoints);
    if (!pts) { toast.error("Введите число баллов"); return; }
    setAwarding(true);
    const res = await fetch("/api/loyalty/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, points: pts, description: awardDesc.trim() || undefined }),
    });
    setAwarding(false);
    if (res.ok) {
      const d = await res.json() as { new_total: number };
      toast.success(`Итого: ${d.new_total} баллов`);
      setAwardPoints(""); setAwardDesc("");
      load();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка");
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Загрузка...</div>;

  if (!profile?.enrolled) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-gray-400 text-sm">Клиент не участвует в программе лояльности</div>
        <button
          onClick={handleEnroll}
          disabled={enrolling}
          className="px-5 py-2 bg-[#516895] text-white text-sm font-medium rounded-xl hover:bg-[#3f5278] disabled:opacity-50 transition"
        >
          {enrolling ? "Записываем..." : "Записать в программу"}
        </button>
      </div>
    );
  }

  const tierCls = TIER_STYLE[profile.tier_color ?? "gray"] ?? TIER_STYLE.gray;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 border border-[#c8d3e8] rounded-xl bg-white">
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-0.5">Уровень</div>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-semibold border ${tierCls}`}>
            {profile.tier_name ?? "—"}
          </span>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Баллы</div>
          <div className="text-2xl font-bold text-gray-900">{(profile.total_points ?? 0).toLocaleString("ru-RU")}</div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-xs text-gray-500 mb-0.5">В программе с</div>
          <div className="text-sm text-gray-700">
            {profile.enrolled_at ? new Date(profile.enrolled_at).toLocaleDateString("ru-RU") : "—"}
          </div>
        </div>
      </div>

      {/* Award / deduct */}
      <div className="border border-[#c8d3e8] rounded-xl p-4 bg-white space-y-3">
        <div className="text-sm font-medium text-gray-700">Начислить / снять баллы</div>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Баллы (+ или −)"
            value={awardPoints}
            onChange={e => setAwardPoints(e.target.value)}
            className="w-36 px-3 py-1.5 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895]"
          />
          <input
            type="text"
            placeholder="Комментарий..."
            value={awardDesc}
            onChange={e => setAwardDesc(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895]"
          />
          <button
            onClick={handleAward}
            disabled={awarding || !awardPoints.trim()}
            className="px-4 py-1.5 bg-[#516895] text-white text-sm font-medium rounded-lg hover:bg-[#3f5278] disabled:opacity-50 transition"
          >
            {awarding ? "..." : "Применить"}
          </button>
        </div>
      </div>

      {/* Transaction history */}
      <div className="border border-[#c8d3e8] rounded-xl overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-[#c8d3e8] text-sm font-medium text-gray-700">История баллов</div>
        {!profile.transactions?.length ? (
          <div className="py-8 text-center text-sm text-gray-400">Нет операций</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[#c8d3e8]">
              {profile.transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 text-xs w-36">
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className={`px-4 py-2.5 font-semibold tabular-nums w-20 ${tx.points >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {tx.points >= 0 ? "+" : ""}{tx.points}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{tx.description ?? tx.tx_type ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
