/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/locale";
import { useConfirm } from "@/lib/confirm";

export interface Activity {
  id:          number;
  customer_id: number;
  act_type:    string;
  body:        string | null;
  outcome:     string | null;
  created_by:  string | null;
  created_at:  string | null;
}

const TYPE_ICONS: Record<string, string> = {
  call:    "📞",
  meeting: "🤝",
  note:    "📝",
  email:   "📧",
  other:   "💬",
};

const OUTCOME_CLS: Record<string, string> = {
  reached:   "border-emerald-500/40 text-emerald-400",
  no_answer: "border-red-500/40 text-red-400",
  voicemail: "border-[#c8d3e8] text-gray-400",
  busy:      "border-amber-500/40 text-amber-400",
  completed: "border-emerald-500/40 text-emerald-400",
  cancelled: "border-red-500/40 text-red-400",
};

const CALL_OUTCOMES = ["reached", "no_answer", "voicemail", "busy"];
const MTG_OUTCOMES  = ["completed", "cancelled"];

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
  customerId:   number;
  currentUser?: string;
  isAdmin?:     boolean;
}

export default function ActivityTimeline({ customerId, currentUser, isAdmin }: Props) {
  const t       = useT();
  const confirm = useConfirm();
  const [items, setItems]     = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  const [type, setType]       = useState("note");
  const [outcome, setOutcome] = useState("");
  const [body, setBody]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch(`/api/activities?customer_id=${customerId}`);
    const data = await res.json().catch(() => []);
    if (!res.ok) setError((data as { error?: string }).error ?? t("common.error"));
    else setItems(data as Activity[]);
    setLoading(false);
  }, [customerId, t]);

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
    if (!await confirm({ message: t("activities.deleteConfirm"), danger: true })) return;
    await fetch(`/api/activities/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(a => a.id !== id));
  }

  const outcomeOpts = type === "call" ? CALL_OUTCOMES : type === "meeting" ? MTG_OUTCOMES : [];

  return (
    <div className="space-y-4">
      <div className="border border-[#c8d3e8] rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {Object.keys(TYPE_ICONS).map((k) => (
            <button
              key={k}
              onClick={() => { setType(k); setOutcome(""); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition
                ${type === k
                  ? "bg-gray-900 border-gray-700 text-white"
                  : "border-[#c8d3e8] text-gray-500 hover:bg-gray-100"}`}
            >
              {TYPE_ICONS[k]} {t(`activityTypes.${k}`)}
            </button>
          ))}
        </div>

        {outcomeOpts.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {outcomeOpts.map((k) => (
              <button
                key={k}
                onClick={() => setOutcome(o => o === k ? "" : k)}
                className={`px-2.5 py-1 rounded-lg text-sm border transition
                  ${outcome === k
                    ? `${OUTCOME_CLS[k]} bg-gray-100`
                    : "border-[#c8d3e8] text-gray-500 hover:border-[#c8d3e8]"}`}
              >
                {t(`activityOutcomes.${k}`)}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={type === "note" ? t("activities.bodyPlaceholder") : t("activities.commentPlaceholder")}
          rows={2}
          className="w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#c8d3e8] resize-none"
        />

        <div className="flex justify-end">
          <button
            onClick={add}
            disabled={saving || (type === "note" && !body.trim())}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {saving ? t("common.saving") : `${t("activities.add")} ${t(`activityTypes.${type}`)}`}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-100 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{t("activities.noActivity")}</p>
      ) : (
        <div className="relative space-y-0">
          <div className="absolute left-4.75 top-2 bottom-2 w-px bg-gray-200" />

          {items.map((a) => {
            const icon    = TYPE_ICONS[a.act_type] ?? TYPE_ICONS.other;
            const typeLabel = t(`activityTypes.${a.act_type}`);
            const outCls  = a.outcome ? OUTCOME_CLS[a.outcome] : null;
            const canDel  = isAdmin || a.created_by === currentUser;
            return (
              <div key={a.id} className="flex gap-3 group pb-4 last:pb-0">
                <div className="shrink-0 w-10 h-10 rounded-full border border-[#c8d3e8] bg-gray-50 flex items-center justify-center text-base z-10">
                  {icon}
                </div>

                <div className="flex-1 min-w-0 border border-[#c8d3e8] rounded-xl bg-gray-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700">{typeLabel}</span>
                      {outCls && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${outCls}`}>
                          {t(`activityOutcomes.${a.outcome}`)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">{fmtDate(a.created_at)}</span>
                      {canDel && (
                        <button
                          onClick={() => remove(a.id)}
                          className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 text-sm px-1"
                          title={t("common.delete")}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {a.body && (
                    <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{a.body}</p>
                  )}

                  {a.created_by && (
                    <p className="text-[11px] text-gray-400 mt-1.5">{a.created_by}</p>
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
