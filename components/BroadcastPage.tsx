/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const SEGMENTS = [
  { v: "all",      label: "Все клиенты",         desc: "Все привязанные к Telegram" },
  { v: "vip",      label: "VIP",                  desc: "Выручка ≥ 50 000 MDL за 90 дней" },
  { v: "active",   label: "Активные",             desc: "Заказ в последние 60 дней" },
  { v: "new",      label: "Новые",                desc: "Первый заказ в последние 30 дней" },
  { v: "sleeping", label: "Спящие",               desc: "Последний заказ 60–180 дней назад" },
  { v: "churned",  label: "Ушедшие",              desc: "Нет заказов > 180 дней" },
];

interface SendResult { sent: number; total: number; errors: string[]; }

export default function BroadcastPage() {
  const searchParams = useSearchParams();
  const [segment, setSegment]   = useState("all");
  const [message, setMessage]   = useState("");
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState<SendResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    const s = searchParams.get("segment");
    if (s && SEGMENTS.some(seg => seg.v === s)) setSegment(s);
  }, [searchParams]);

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
    if (!res.ok) { setError(json.error ?? "Ошибка"); return; }
    setResult(json);
    setMessage("");
  }

  const seg = SEGMENTS.find(s => s.v === segment);

  return (
    <div className="p-8 ">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Рассылки</h1>
        <p className="text-sm text-zinc-500 mt-1">Отправить Telegram-сообщение сегменту клиентов</p>
      </div>

      <div className="space-y-5">
        {/* Segment picker */}
        <div>
          <label className="block text-sm font-medium mb-2">Сегмент получателей</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SEGMENTS.map(s => (
              <button
                key={s.v}
                onClick={() => setSegment(s.v)}
                className={`text-left p-3 rounded-xl border text-sm transition ${
                  segment === s.v
                    ? "border-zinc-300 bg-white/10 text-zinc-400"
                    : "border-zinc-800 text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium mb-2">Текст сообщения</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Уважаемые клиенты! ..."
            className="w-full border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-400 transition resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-zinc-600">{message.length} символов</span>
            {message.length > 4096 && (
              <span className="text-xs text-red-400">Превышен лимит Telegram (4096)</span>
            )}
          </div>
        </div>

        {/* Preview */}
        {message.trim() && (
          <div className="border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-2">Предпросмотр → {seg?.label}</div>
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
          {sending ? "Отправка..." : `Отправить сегменту «${seg?.label}»`}
        </button>

        {/* Result */}
        {result && (
          <div className={`border rounded-xl p-4 text-sm ${
            result.errors.length === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}>
            <div className="font-medium mb-1">
              ✓ Отправлено: {result.sent} из {result.total}
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1 mt-2">
                <div className="text-xs font-medium text-amber-400">Ошибки:</div>
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-amber-300/70">{e}</div>
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
