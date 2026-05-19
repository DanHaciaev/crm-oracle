"use client";

import { useCallback, useEffect, useState } from "react";
import { useT, useLocale } from "@/lib/locale";

interface Rule {
  id: number; name: string; trigger_type: string;
  condition_days: number; action_type: string;
  message_template: string | null; task_title: string | null;
  cooldown_days: number; segment: string; active: boolean;
  created_at: string | null; last_fired: string | null; fired_30d: number;
}

interface LogEntry {
  id: number; rule_id: number; rule_name: string;
  customer_id: number; customer_name: string | null;
  action_type: string | null; result: string;
  details: string | null; fired_at: string | null;
}

interface AutoData { rules: Rule[]; log: LogEntry[] }

const RESULT_CLS: Record<string, string> = {
  success: "border-emerald-500/40 text-emerald-400",
  error:   "border-red-500/40 text-red-400",
  skipped: "border-gray-800 text-gray-400",
};

export default function AutomationsPage() {
  const t = useT();
  const { locale } = useLocale();
  const [data, setData]         = useState<AutoData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  function emptyForm() {
    return {
      name: "", condition_days: 30, action_type: "tg_message",
      message_template: t("automations.defaultTemplate"),
      task_title: "", cooldown_days: 14, segment: "all", active: true,
    };
  }

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(() => emptyForm());
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ACTION_LABELS: Record<string, string> = {
    tg_message:   t("automationActions.tg_message"),
    manager_task: t("automationActions.manager_task"),
  };
  const SEGMENT_LABELS: Record<string, string> = {
    all:      t("segments.all"),
    vip:      t("segments.vip"),
    active:   t("segments.active"),
    sleeping: t("segments.sleeping"),
    churned:  t("segments.churned"),
  };
  const RESULT_LABELS: Record<string, string> = {
    success: t("automations.results.success"),
    error:   t("automations.results.error"),
    skipped: t("automations.results.skipped"),
  };

  function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
    return d.toLocaleString(loc, {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch("/api/automations");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError((json as { error?: string }).error ?? t("common.error"));
    else setData(json as AutoData);
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true); setRunResult(null);
    const res  = await fetch("/api/cron/automations", { method: "POST" });
    const json = await res.json().catch(() => ({})) as {
      total_fired?: number; total_skipped?: number;
      total_errors?: number; rules_checked?: number;
      summary?: { rule: string; fired: number; skipped: number; errors: number }[];
      error?: string;
    };
    setRunning(false);
    if (!res.ok) { setRunResult(`${t("common.error")}: ${json.error ?? "?"}`); return; }
    const parts = (json.summary ?? []).map(
      (s) => `${s.rule}: ${t("broadcasts.sent")} ${s.fired}, ${t("automations.results.skipped")} ${s.skipped}${s.errors ? `, ${t("broadcasts.errors")} ${s.errors}` : ""}`
    );
    setRunResult(
      `${t("automations.cols.condition")}: ${json.rules_checked}. ${t("broadcasts.sent")}: ${json.total_fired}. ` +
      (parts.length ? `\n${parts.join("\n")}` : "")
    );
    load();
  }

  async function toggleRule(id: number, active: boolean) {
    setToggling(id);
    await fetch(`/api/automations/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setToggling(null);
    setData((prev) =>
      prev ? { ...prev, rules: prev.rules.map((r) => r.id === id ? { ...r, active } : r) } : prev
    );
  }

  async function deleteRule(id: number, name: string) {
    if (!confirm(`${t("automations.deleteConfirm")} "${name}"? ${t("automations.deleteRuleConfirm")}`)) return;
    setDeleting(id);
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    setDeleting(null);
    setData((prev) =>
      prev ? { ...prev, rules: prev.rules.filter((r) => r.id !== id) } : prev
    );
  }

  async function createRule() {
    setSaving(true); setFormError(null);
    const res  = await fetch("/api/automations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:             form.name,
        condition_days:   form.condition_days,
        action_type:      form.action_type,
        message_template: form.action_type === "tg_message" ? form.message_template : null,
        task_title:       form.action_type === "manager_task" ? form.task_title : null,
        cooldown_days:    form.cooldown_days,
        segment:          form.segment,
        active:           form.active,
      }),
    });
    const json = await res.json().catch(() => ({})) as { error?: string };
    setSaving(false);
    if (!res.ok) { setFormError(json.error ?? t("common.error")); return; }
    setShowForm(false);
    setForm(emptyForm());
    load();
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error)   return <div className="p-8 text-sm text-red-400">{error}</div>;
  if (!data)   return null;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("automations.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("automations.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowForm(true); setFormError(null); }}
            className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:bg-gray-100 transition text-gray-700"
          >
            + {t("automations.newRule")}
          </button>
          <button
            onClick={runNow} disabled={running}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition"
          >
            {running ? t("automations.running") : `▶ ${t("automations.runNow")}`}
          </button>
        </div>
      </div>

      {/* Run result */}
      {runResult && (
        <div className="border border-emerald-500/30 bg-emerald-500/8 rounded-xl px-4 py-3 text-sm text-emerald-300 whitespace-pre-wrap">
          {runResult}
        </div>
      )}

      {/* Cron hint */}
      <div className="border border-gray-800 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-500 space-y-1">
        <div className="text-gray-600 font-medium mb-1">{t("automations.scheduleTitle")}</div>
        <code className="text-gray-700 block mt-1">
          curl -X POST https://&lt;your-domain&gt;/api/cron/automations \<br/>
          &nbsp;&nbsp;-H &quot;Authorization: Bearer $CRON_SECRET&quot;
        </code>
      </div>

      {/* Rules table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t("automations.cols.name")}</h2>
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-sm text-gray-500 border-b border-gray-800">
              <tr>
                <th className="text-left px-4 py-3">{t("automations.ruleName")}</th>
                <th className="text-center px-3 py-3">{t("automations.cols.condition")}</th>
                <th className="text-center px-3 py-3">{t("automations.cols.segment")}</th>
                <th className="text-center px-3 py-3">{t("automations.cols.action")}</th>
                <th className="text-center px-3 py-3">{t("automations.cols.cooldown")}</th>
                <th className="text-center px-3 py-3">{t("automations.last30days")}</th>
                <th className="text-center px-3 py-3">{t("automations.lastRun")}</th>
                <th className="text-center px-3 py-3">{t("automations.cols.status")}</th>
                <th className="text-center px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-sm text-gray-400 mt-0.5 truncate max-w-xs">
                      {r.message_template ?? r.task_title ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-500">{t("automations.noOrdersDays")} {r.condition_days} {t("common.days")}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-sm border border-gray-800 text-gray-600">
                      {SEGMENT_LABELS[r.segment] ?? r.segment}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-500 text-sm">{ACTION_LABELS[r.action_type] ?? r.action_type}</td>
                  <td className="px-3 py-3 text-center text-gray-400 text-sm">{r.cooldown_days} {t("common.days")}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-700">{r.fired_30d}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-400">{fmtDate(r.last_fired)}</td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleRule(r.id, !r.active)}
                      disabled={toggling === r.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50
                        ${r.active ? "bg-emerald-500" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                        ${r.active ? "translate-x-4" : "translate-x-1"}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => deleteRule(r.id, r.name)}
                      disabled={deleting === r.id}
                      className="text-gray-400 hover:text-red-500 transition text-sm disabled:opacity-40"
                      title={t("automations.deleteConfirm")}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {data.rules.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400 py-6 text-sm">
                    {t("automations.noRulesYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Log */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t("automations.lastFirings")}</h2>
        {data.log.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center border border-gray-800 rounded-xl">
            {t("automations.noFirings")}
          </p>
        ) : (
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-sm text-gray-500 border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3">{t("automations.ruleName")}</th>
                  <th className="text-left px-3 py-3">{t("sales.customer")}</th>
                  <th className="text-center px-3 py-3">{t("automations.cols.action")}</th>
                  <th className="text-center px-3 py-3">{t("automations.result")}</th>
                  <th className="text-center px-4 py-3">{t("automations.firedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((l) => {
                  const cls = RESULT_CLS[l.result] ?? RESULT_CLS.error;
                  const label = RESULT_LABELS[l.result] ?? l.result;
                  return (
                    <tr key={l.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5 text-gray-800">{l.rule_name}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.customer_name ?? `#${l.customer_id}`}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-500">
                        {ACTION_LABELS[l.action_type ?? ""] ?? l.action_type ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>
                          {label}
                        </span>
                        {l.details && (
                          <div className="text-[10px] text-red-500 mt-0.5 max-w-xs truncate">{l.details}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-sm text-gray-400 whitespace-nowrap">
                        {fmtDate(l.fired_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create rule modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900">{t("automations.newRuleTitle")}</h2>

            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t("automations.nameLabel")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t("automations.conditionLabel")}</label>
              <input
                type="number" min={1} max={365}
                value={form.condition_days}
                onChange={(e) => setForm((f) => ({ ...f, condition_days: Number(e.target.value) }))}
                className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t("automations.segmentLabel")}</label>
              <select
                value={form.segment}
                onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800"
              >
                {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t("automations.cols.action")}</label>
              <div className="flex gap-2">
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setForm((f) => ({ ...f, action_type: k }))}
                    className={`flex-1 py-2 text-sm rounded-lg border transition
                      ${form.action_type === k
                        ? "border-gray-800 text-white bg-gray-900"
                        : "border-gray-800 text-gray-600 hover:bg-gray-100"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {form.action_type === "tg_message" && (
              <div className="space-y-1">
                <label className="text-sm text-gray-500">
                  {t("automations.messageTplLabel")} — <code className="text-gray-700">{"{{customer_name}}"}</code> <code className="text-gray-700">{"{{days_since}}"}</code>
                </label>
                <textarea
                  rows={4}
                  value={form.message_template}
                  onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
                  className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800 resize-none"
                />
              </div>
            )}

            {form.action_type === "manager_task" && (
              <div className="space-y-1">
                <label className="text-sm text-gray-500">{t("automations.taskTitleLabel")}</label>
                <input
                  value={form.task_title}
                  onChange={(e) => setForm((f) => ({ ...f, task_title: e.target.value }))}
                  className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm text-gray-500">{t("automations.cooldownLabel")}</label>
              <input
                type="number" min={1} max={365}
                value={form.cooldown_days}
                onChange={(e) => setForm((f) => ({ ...f, cooldown_days: Number(e.target.value) }))}
                className="w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                  ${form.active ? "bg-emerald-500" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                  ${form.active ? "translate-x-4" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-gray-600">{t("automations.activeImmediately")}</span>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowForm(false); setFormError(null); }}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border border-gray-800 text-gray-700 hover:bg-gray-100 transition disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={createRule}
                disabled={saving || !form.name}
                className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition disabled:opacity-50"
              >
                {saving ? t("common.saving") : t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
