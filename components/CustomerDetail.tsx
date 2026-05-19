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
import TasksPage from "@/components/TasksPage";

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

type Tab = "info" | "sales" | "activities" | "tasks" | "files" | "telegram";

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
    <section className="border border-zinc-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300">{t("customers.retention.title")}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="border border-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">{t("customers.ltv")}</div>
          <div className="text-lg font-bold text-zinc-100 tabular-nums">
            {total_revenue.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-zinc-600">MDL</div>
        </div>
        <div className="border border-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">{t("customers.retention.avgCheck")}</div>
          <div className="text-lg font-bold text-zinc-100 tabular-nums">
            {avg_check.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-zinc-600">MDL · {order_count} {t("customers.ordersCount").toLowerCase()}</div>
        </div>
        <div className="border border-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">{t("customers.retention.daysSinceLast")}</div>
          <div className={`text-lg font-bold tabular-nums ${daysColor}`}>
            {days_since_last !== null ? days_since_last : "—"}
          </div>
          <div className="text-[10px] text-zinc-600">
            {avg_days_between !== null
              ? `${t("customers.retention.cycle")}${avg_days_between} ${t("common.days")}`
              : t("customers.retention.unknownCycle")}
          </div>
        </div>
        <div className="border border-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">{t("customers.retention.nextOrder")}</div>
          <div className="text-sm font-semibold text-zinc-200">{fmtD(next_order_expected)}</div>
          {overdue_days !== null && overdue_days > 0 ? (
            <div className="text-[10px] text-red-400 mt-0.5">
              {t("customers.retention.overdue")} {overdue_days} {t("common.days")}
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600 mt-0.5">{t("customers.retention.forecast")}</div>
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
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5">{value && String(value).trim() !== "" ? value : "—"}</div>
    </div>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4 text-center">
      <div className={`text-xl font-bold tabular-nums ${highlight ?? ""}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function BindingStatus({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "border-zinc-600 text-zinc-300",
    bound:   "border-emerald-500/40 text-emerald-300",
    revoked: "border-red-500/40 text-red-300",
    expired: "border-orange-500/40 text-orange-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${map[s] ?? "border-zinc-600 text-zinc-300"}`}>
      {s}
    </span>
  );
}

export default function CustomerDetail({ id }: { id: string }) {
  const t = useT();
  const { locale } = useLocale();
  const [data, setData]               = useState<CustomerDetail | null>(null);
  const [stats, setStats]             = useState<CustomerStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<Tab>("info");
  const [newLink, setNewLink]         = useState<string | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]         = useState(false);
  const router                        = useRouter();

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

  async function generateLink() {
    setGenerating(true); setNewLink(null);
    const res  = await fetch(`/api/customers/${id}/invite-link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_days: 7 }),
    });
    const json = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { alert((json as { error?: string }).error ?? t("common.error")); return; }
    setNewLink((json as { url: string }).url);
    fetchData();
  }

  async function revokeBinding(bindingId: number) {
    if (!confirm(t("customers.tg.revokeConfirm"))) return;
    const res = await fetch(`/api/customers/${id}/invite-link`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ binding_id: bindingId }),
    });
    if (!res.ok) { alert(t("common.error")); return; }
    fetchData();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {}, () => alert(t("common.error")));
  }

  async function deleteCustomer(soft: boolean) {
    if (!data) return;
    if (!confirm(`${soft ? t("customers.deactivate") : t("customers.deleteButton")} «${data.name}»?`)) return;
    setDeleting(true);
    const res  = await fetch(`/api/customers/${id}${soft ? "?soft=1" : ""}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({} as { error?: string; code?: string }));
    setDeleting(false);
    if (res.ok) { router.push("/customers"); return; }
    if (!soft && (json as { code?: string }).code === "HAS_DEPENDENCIES") {
      if (confirm(`${(json as { error?: string }).error ?? t("customers.hasDepsTitle")}\n\n${t("customers.deactivate")}?`)) deleteCustomer(true);
      return;
    }
    alert((json as { error?: string }).error ?? t("common.error"));
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
  ];

  return (
    <div className="p-8 space-y-6">
      <Link href="/customers" className="text-sm text-zinc-500 hover:text-zinc-300 transition">
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
              <div className="text-xs text-zinc-500">LTV (MDL)</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{stats.order_count}</div>
              <div className="text-xs text-zinc-500">{t("customers.ordersCount")}</div>
            </div>
            <div>
              <div className={`text-lg font-bold tabular-nums ${churnColor ?? ""}`}>
                {churnPct !== null ? `${churnPct > 0 ? "+" : ""}${churnPct}%` : "—"}
              </div>
              <div className="text-xs text-zinc-500">{t("customers.dynamics30")}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {TABS.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${
              tab === tb.key ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-6">
          <section className="border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label={t("common.type")}             value={data.customer_type} />
            <Field label={t("common.country")}          value={data.country} />
            <Field label="Tax ID"                       value={data.tax_id} />
            <Field label={t("customers.contactPhone")}  value={data.contact_phone} />
            <Field label={t("customers.contactEmail")}  value={data.contact_email} />
            <Field label={t("customers.active")}        value={data.active ? t("common.yes") : t("common.no")} />
            <div className="md:col-span-2"><Field label={t("customers.address")} value={data.address} /></div>
          </section>

          {stats && stats.order_count > 0 && <RetentionBlock stats={stats} />}

          <section className="border border-red-500/30 rounded-xl p-5">
            <h2 className="text-base font-semibold text-red-300 mb-1">{t("customers.dangerZone")}</h2>
            <p className="text-xs text-gray-400 mb-4">{t("customers.dangerZoneDesc")}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => deleteCustomer(false)} disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition">
                {deleting ? t("customers.deletingBtn") : t("customers.deleteButton")}
              </button>
              {data.active && (
                <button onClick={() => deleteCustomer(true)} disabled={deleting}
                  className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 transition">
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
            <div className="border border-zinc-800 rounded-xl p-5">
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
                      <Cell key={i} fill={i === stats.monthly.length - 1 ? "#60a5fa" : "#3f3f46"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <SalesTable customerId={data.id} compact />
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
        <section className="border border-zinc-800 rounded-xl p-5 space-y-4">
          {data.AGRO_CRM_APP_USERS.length > 0 ? (
            <div className="space-y-3">
              {data.AGRO_CRM_APP_USERS.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 border border-emerald-500/20 bg-emerald-500/5 rounded-lg px-4 py-3">
                  <div className="text-sm">
                    <div>
                      <span className="text-emerald-300 mr-2">{t("customers.tg.linked")}</span>
                      {u.telegram_username ? <span className="font-mono">@{u.telegram_username}</span> : null}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
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
              className="px-4 py-2 text-sm rounded-lg border border-zinc-300 bg-zinc-100 text-black hover:bg-white disabled:opacity-50 transition">
              {generating ? t("customers.tg.creating") : t("customers.tg.createInvite")}
            </button>
            <span className="text-xs text-gray-500">{t("customers.tg.ttl")}</span>
          </div>

          {newLink && (
            <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
              <code className="break-all text-emerald-200">{newLink}</code>
              <button onClick={() => copy(newLink)}
                className="px-3 py-1 text-xs rounded-md border border-emerald-400/40 hover:bg-emerald-500/20 shrink-0">
                {t("common.copy")}
              </button>
            </div>
          )}

          {data.bindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">{t("customers.tg.history")}</h3>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900/60 text-xs text-gray-400">
                    <tr>
                      <th className="text-left px-3 py-2">{t("customers.tg.token")}</th>
                      <th className="text-left px-3 py-2">{t("common.status")}</th>
                      <th className="text-left px-3 py-2">{t("customers.tg.created")}</th>
                      <th className="text-left px-3 py-2">{t("customers.tg.expires")}</th>
                      <th className="text-left px-3 py-2">{t("customers.tg.bound")}</th>
                      <th className="text-right px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bindings.map((b) => (
                      <tr key={b.id} className="border-t border-zinc-800">
                        <td className="px-3 py-2 font-mono text-xs">{shortToken(b.invite_token)}</td>
                        <td className="px-3 py-2 text-xs"><BindingStatus s={b.status} /></td>
                        <td className="px-3 py-2 text-xs">{fmtDate(b.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{fmtDate(b.expires_at)}</td>
                        <td className="px-3 py-2 text-xs">{fmtDate(b.bound_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {b.status === "pending" && (
                            <button onClick={() => revokeBinding(b.id)}
                              className="px-2 py-1 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition">
                              {t("customers.tg.revoke")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
