"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/locale";

interface AuditEntry {
  id: number; entity_type: string; entity_id: number;
  entity_name: string | null; action: string;
  changed_by: string | null; changed_at: string | null;
  old_values: string | null; new_values: string | null;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function DiffBlock({ label, raw }: { label: string; raw: string | null }) {
  if (!raw) return null;
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const entries = Object.entries(parsed).filter(([, v]) => v !== null && v !== "");
  if (!entries.length) return null;
  return (
    <div className="mt-2">
      <div className="text-[10px] text-gray-400 uppercase mb-1">{label}</div>
      <div className="bg-gray-50 border border-gray-800 rounded-lg px-3 py-2 space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-sm">
            <span className="text-gray-500 shrink-0 w-28 truncate">{k}:</span>
            <span className="text-gray-800 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTION_CLS: Record<string, string> = {
  create: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  update: "text-sky-400     border-sky-500/40     bg-sky-500/10",
  delete: "text-red-400     border-red-500/40     bg-red-500/10",
};

export default function AuditLogPage() {
  const t = useT();
  const [entries, setEntries]       = useState<AuditEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [entityType, setEntityType] = useState("all");
  const [expanded, setExpanded]     = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const q = entityType !== "all" ? `?entity_type=${entityType}&limit=100` : "?limit=100";
    const res  = await fetch(`/api/audit-log${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setEntries(data as AuditEntry[]);
    setLoading(false);
  }, [entityType, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const FILTERS = [
    { v: "all",      label: t("auditLog.filter.all")       },
    { v: "customer", label: t("auditLog.filter.customers") },
    { v: "task",     label: t("auditLog.filter.tasks")     },
    { v: "lead",     label: t("auditLog.filter.leads")     },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("auditLog.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("auditLog.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.v} onClick={() => setEntityType(f.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              entityType === f.v
                ? "border-gray-800 bg-gray-900 text-white"
                : "border-gray-800 text-gray-500 hover:bg-gray-100"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-400 py-8">{t("common.loading")}</div>}
      {error   && <div className="text-red-500 py-8">{error}</div>}

      {!loading && !error && (
        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="text-center text-gray-400 py-16">{t("auditLog.empty")}</div>
          )}
          {entries.map(e => {
            const cls    = ACTION_CLS[e.action] ?? "text-gray-600 border-gray-800";
            const isOpen = expanded === e.id;
            return (
              <div key={e.id} className="border border-gray-800 rounded-xl overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3"
                  onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <span className={`shrink-0 mt-0.5 text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
                    {t(`auditLog.actions.${e.action}`) || e.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 text-sm">
                        {t(`auditLog.entities.${e.entity_type}`) || e.entity_type} #{e.entity_id}
                      </span>
                      {e.entity_name && <span className="font-medium">{e.entity_name}</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {e.changed_by ?? "—"} · {fmtDate(e.changed_at)}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm shrink-0 mt-1">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-800">
                    <DiffBlock label={t("auditLog.was")}    raw={e.old_values} />
                    <DiffBlock label={t("auditLog.became")} raw={e.new_values} />
                    {!e.old_values && !e.new_values && (
                      <div className="text-sm text-gray-400 mt-2">{t("auditLog.noDetails")}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-400">
          {t("auditLog.showing")}: {entries.length} {t("auditLog.records")}
        </div>
      )}
    </div>
  );
}
