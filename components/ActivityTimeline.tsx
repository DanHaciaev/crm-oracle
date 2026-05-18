"use client";

import { useCallback, useEffect, useState } from "react";

export interface Activity {
  id:          number;
  customer_id: number;
  act_type:    string;
  body:        string | null;
  outcome:     string | null;
  created_by:  string | null;
  created_at:  string | null;
}

const TYPE_CFG: Record<string, { icon: string; label: string }> = {
  call:    { icon: "📞", label: "Звонок"  },
  meeting: { icon: "🤝", label: "Встреча" },
  note:    { icon: "📝", label: "Заметка" },
  email:   { icon: "📧", label: "Письмо"  },
  other:   { icon: "💬", label: "Прочее"  },
};

const OUTCOME_LABELS: Record<string, { label: string; cls: string }> = {
  reached:   { label: "Дозвонились",     cls: "border-emerald-500/40 text-emerald-400" },
  no_answer: { label: "Не ответил",      cls: "border-red-500/40 text-red-400"         },
  voicemail: { label: "Голос. почта",    cls: "border-zinc-600 text-zinc-400"           },
  busy:      { label: "Занято",          cls: "border-amber-500/40 text-amber-400"      },
  completed: { label: "Состоялась",      cls: "border-emerald-500/40 text-emerald-400"  },
  cancelled: { label: "Отменена",        cls: "border-red-500/40 text-red-400"          },
};

const CALL_OUTCOMES  = ["reached", "no_answer", "voicemail", "busy"];
const MTG_OUTCOMES   = ["completed", "cancelled"];

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  customerId: number;
  currentUser?: string;
  isAdmin?: boolean;
}

export default function ActivityTimeline({ customerId, currentUser, isAdmin }: Props) {
  const [items, setItems]   = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [type, setType]       = useState("note");
  const [outcome, setOutcome] = useState("");
  const [body, setBody]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch(`/api/activities?customer_id=${customerId}`);
    const data = await res.json().catch(() => []);
    if (!res.ok) setError((data as { error?: string }).error ?? "Ошибка");
    else setItems(data as Activity[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!body.trim() && type === "note") return;
    setSaving(true);
    await fetch("/api/activities", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        act_type:    type,
        body:        body.trim() || null,
        outcome:     outcome || null,
      }),
    });
    setBody(""); setOutcome(""); setSaving(false);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Удалить активность?")) return;
    await fetch(`/api/activities/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(a => a.id !== id));
  }

  const outcomeOpts = type === "call" ? CALL_OUTCOMES : type === "meeting" ? MTG_OUTCOMES : [];

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(TYPE_CFG).map(([k, v]) => (
            <button
              key={k}
              onClick={() => { setType(k); setOutcome(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition
                ${type === k
                  ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:bg-zinc-800/60"}`}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {outcomeOpts.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {outcomeOpts.map((k) => (
              <button
                key={k}
                onClick={() => setOutcome(o => o === k ? "" : k)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition
                  ${outcome === k
                    ? `${OUTCOME_LABELS[k].cls} bg-zinc-800`
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
              >
                {OUTCOME_LABELS[k].label}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={type === "note" ? "Текст заметки..." : "Комментарий (необязательно)"}
          rows={2}
          className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 resize-none"
        />

        <div className="flex justify-end">
          <button
            onClick={add}
            disabled={saving || (type === "note" && !body.trim())}
            className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-40 transition"
          >
            {saving ? "Сохраняем..." : `Добавить ${TYPE_CFG[type]?.label ?? ""}`}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse bg-zinc-800/40 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-600 py-4 text-center">Активностей пока нет</p>
      ) : (
        <div className="relative space-y-0">
          {/* vertical line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-zinc-800" />

          {items.map((a) => {
            const cfg     = TYPE_CFG[a.act_type] ?? TYPE_CFG.other;
            const outCfg  = a.outcome ? OUTCOME_LABELS[a.outcome] : null;
            const canDel  = isAdmin || a.created_by === currentUser;
            return (
              <div key={a.id} className="flex gap-3 group pb-4 last:pb-0">
                {/* dot */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full border border-zinc-700 bg-zinc-900 flex items-center justify-center text-base z-10">
                  {cfg.icon}
                </div>

                <div className="flex-1 min-w-0 border border-zinc-800 rounded-xl bg-zinc-900/60 px-4 py-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-zinc-300">{cfg.label}</span>
                      {outCfg && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${outCfg.cls}`}>
                          {outCfg.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-600">{fmtDate(a.created_at)}</span>
                      {canDel && (
                        <button
                          onClick={() => remove(a.id)}
                          className="text-zinc-700 hover:text-red-400 transition opacity-0 group-hover:opacity-100 text-xs px-1"
                          title="Удалить"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {a.body && (
                    <p className="text-sm text-zinc-300 mt-1.5 whitespace-pre-wrap">{a.body}</p>
                  )}

                  {a.created_by && (
                    <p className="text-[11px] text-zinc-600 mt-1.5">{a.created_by}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
