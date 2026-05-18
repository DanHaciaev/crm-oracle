"use client";

import { useCallback, useEffect, useState } from "react";

interface AuditEntry {
  id: number; entity_type: string; entity_id: number;
  entity_name: string | null; action: string;
  changed_by: string | null; changed_at: string | null;
  old_values: string | null; new_values: string | null;
}

const ENTITY_LABELS: Record<string, string> = {
  customer: "Клиент", task: "Задача", lead: "Лид",
};
const ACTION_CFG: Record<string, { label: string; cls: string }> = {
  create: { label: "Создан",  cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  update: { label: "Изменён", cls: "text-sky-400     border-sky-500/40     bg-sky-500/10"     },
  delete: { label: "Удалён",  cls: "text-red-400     border-red-500/40     bg-red-500/10"     },
};

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
      <div className="text-[10px] text-zinc-600 uppercase mb-1">{label}</div>
      <div className="bg-zinc-900 rounded-lg px-3 py-2 space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-zinc-500 shrink-0 w-28 truncate">{k}:</span>
            <span className="text-zinc-300 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [entityType, setEntityType] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const q = entityType !== "all" ? `?entity_type=${entityType}&limit=100` : "?limit=100";
    const res  = await fetch(`/api/audit-log${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setEntries(data as AuditEntry[]);
    setLoading(false);
  }, [entityType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">История изменений</h1>
        <p className="text-sm text-zinc-500 mt-1">Аудит действий в системе</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {[
          { v: "all",      label: "Все" },
          { v: "customer", label: "Клиенты" },
          { v: "task",     label: "Задачи" },
          { v: "lead",     label: "Лиды" },
        ].map(f => (
          <button key={f.v} onClick={() => setEntityType(f.v)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition ${
              entityType === f.v
                ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-zinc-500 py-8">Загрузка...</div>}
      {error   && <div className="text-red-400 py-8">{error}</div>}

      {!loading && !error && (
        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="text-center text-zinc-600 py-16">История пуста</div>
          )}
          {entries.map(e => {
            const actionCfg = ACTION_CFG[e.action] ?? { label: e.action, cls: "text-zinc-400 border-zinc-700" };
            const isOpen    = expanded === e.id;
            return (
              <div key={e.id}
                className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 hover:bg-zinc-900/40 transition flex items-start gap-3"
                  onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <span className={`shrink-0 mt-0.5 text-[10px] px-2 py-0.5 rounded-full border ${actionCfg.cls}`}>
                    {actionCfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-500 text-xs">
                        {ENTITY_LABELS[e.entity_type] ?? e.entity_type} #{e.entity_id}
                      </span>
                      {e.entity_name && <span className="font-medium">{e.entity_name}</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {e.changed_by ?? "—"} · {fmtDate(e.changed_at)}
                    </div>
                  </div>
                  <span className="text-zinc-600 text-xs shrink-0 mt-1">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-zinc-800/60">
                    <DiffBlock label="Было" raw={e.old_values} />
                    <DiffBlock label="Стало" raw={e.new_values} />
                    {!e.old_values && !e.new_values && (
                      <div className="text-xs text-zinc-600 mt-2">Детали не сохранены</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="mt-4 text-right text-xs text-zinc-600">
          Показано: {entries.length} записей
        </div>
      )}
    </div>
  );
}
