/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/locale";

const SEGMENT_KEYS = ["all", "vip", "active", "new", "sleeping", "churned"] as const;
type SegmentKey = typeof SEGMENT_KEYS[number];

interface SendResult { sent: number; total: number; errors: string[]; }

export default function BroadcastPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const [segment, setSegment]     = useState<SegmentKey>("all");
  const [message, setMessage]     = useState("");
  const [sending, setSending]     = useState(false);
  const [result, setResult]       = useState<SendResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [aiHint, setAiHint]       = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const SEGMENTS = SEGMENT_KEYS.map((v) => ({
    v,
    label: v === "all" ? t("broadcasts.allCustomers") : t(`segments.${v}`),
    desc:  v === "all" ? t("segments.allDesc") : t(`segments.${v}Desc`),
  }));

  useEffect(() => {
    const s = searchParams.get("segment");
    if (s && SEGMENT_KEYS.includes(s as SegmentKey)) setSegment(s as SegmentKey);
  }, [searchParams]);

  async function generateAI() {
    setAiLoading(true); setError(null);
    const res  = await fetch("/api/ai/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment, hint: aiHint }),
    });
    const json = await res.json().catch(() => ({})) as { text?: string; error?: string };
    setAiLoading(false);
    if (!res.ok || !json.text) { setError(json.error ?? t("common.error")); return; }
    setMessage(json.text);
  }

  async function send() {
    if (!message.trim()) return;
    setSending(true); setResult(null); setError(null);
    const res  = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment, message: message.trim() }),
    });
    const json = await res.json().catch(() => ({})) as SendResult & { error?: string };
    setSending(false);
    if (!res.ok) { setError(json.error ?? t("common.error")); return; }
    setResult(json);
    setMessage("");
  }

  const seg = SEGMENTS.find(s => s.v === segment);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("broadcasts.title")}</h1>
        <p className="text-sm text-zinc-500 mt-1">{t("broadcasts.subtitle")}</p>
      </div>

      <div className="space-y-5">
        {/* Segment picker */}
        <div>
          <label className="block text-sm font-medium mb-2">{t("broadcasts.segmentRecipients")}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SEGMENTS.map(s => (
              <button
                key={s.v}
                onClick={() => setSegment(s.v)}
                className={`text-left p-3 rounded-xl border text-sm transition ${
                  segment === s.v
                    ? "border-gray-800 bg-white/10 text-zinc-400"
                    : "border-zinc-800 text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-sm text-zinc-500 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* AI generation */}
        <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium">✨ {t("broadcasts.aiGenerate")}</div>
          <div className="flex gap-2">
            <input
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder={t("broadcasts.aiHintPlaceholder")}
              className="flex-1 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-800 transition"
            />
            <button
              onClick={generateAI}
              disabled={aiLoading}
              className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition whitespace-nowrap"
            >
              {aiLoading ? t("broadcasts.aiGenerating") : t("broadcasts.aiGenerate")}
            </button>
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium mb-2">{t("broadcasts.messageText")}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t("broadcasts.messagePlaceholder")}
            className="w-full border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-800 transition resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm text-zinc-600">{message.length} {t("broadcasts.chars")}</span>
            {message.length > 4096 && (
              <span className="text-sm text-red-400">{t("broadcasts.limitExceeded")}</span>
            )}
          </div>
        </div>

        {/* Preview */}
        {message.trim() && (
          <div className="border border-zinc-800 rounded-xl p-4">
            <div className="text-sm text-zinc-500 mb-2">{t("broadcasts.preview")} → {seg?.label}</div>
            <div className="bg-blue-200 border border-blue-700/30 rounded-xl px-4 py-3 text-sm text-zinc-800 whitespace-pre-wrap w-full wrap-break-word">
              {message}
            </div>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={send}
          disabled={sending || !message.trim() || message.length > 4096}
          className="w-full py-3 rounded-xl bg-white text-black border border-zinc-800 font-medium text-sm hover:bg-zinc-200 disabled:opacity-40 transition"
        >
          {sending ? t("broadcasts.sending") : `${t("broadcasts.sendToSegment")} «${seg?.label}»`}
        </button>

        {/* Result */}
        {result && (
          <div className={`border rounded-xl p-4 text-sm ${
            result.errors.length === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}>
            <div className="font-medium mb-1">
              ✓ {t("broadcasts.sent")}: {result.sent} {t("broadcasts.sentOf")} {result.total}
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1 mt-2">
                <div className="text-sm font-medium text-amber-400">{t("broadcasts.errors")}:</div>
                {result.errors.map((e, i) => (
                  <div key={i} className="text-sm text-amber-300/70">{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="border border-red-500 bg-red-500/10 rounded-xl p-4 text-sm text-red-500">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
