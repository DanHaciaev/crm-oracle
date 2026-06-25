/* eslint-disable react-hooks/exhaustive-deps */
 
 
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Markdown renderer ───────────────────────────────────────────────────────
function MarkdownBlock({ text, small }: { text: string; small?: boolean }) {
  const sz = small ? "text-xs" : "text-sm";
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: string) {
    if (!listItems.length) return;
    nodes.push(
      <ul key={key} className={`list-disc pl-4 space-y-0.5 my-1.5 ${sz} text-gray-700`}>
        {listItems.map((li, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: boldify(li) }} />
        ))}
      </ul>
    );
    listItems = [];
  }
  function boldify(s: string) {
    return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  lines.forEach((line, i) => {
    if (/^## /.test(line)) {
      flushList(`ul-${i}`);
      nodes.push(
        <h3 key={i} className="text-xs font-bold text-[#516895] uppercase tracking-wider mt-4 mb-1.5 flex items-center gap-1.5">
          <span className="w-1 h-3 bg-[#516895] rounded-full inline-block shrink-0" />
          {line.replace(/^## /, "")}
        </h3>
      );
    } else if (/^- /.test(line)) {
      listItems.push(line.replace(/^- /, ""));
    } else if (line.trim() === "") {
      flushList(`ul-${i}`);
    } else {
      flushList(`ul-${i}`);
      nodes.push(
        <p key={i} className={`${sz} text-gray-700 leading-relaxed my-1`}
          dangerouslySetInnerHTML={{ __html: boldify(line) }} />
      );
    }
  });
  flushList("ul-end");
  return <div>{nodes}</div>;
}

// ── Presets ─────────────────────────────────────────────────────────────────
const WISH_PRESETS = [
  "(без доп. пожелания)",
  "Сделай акцент на рисках и как их снизить",
  "Предложи скрипт первого звонка менеджера",
  "Дай краткое резюме в 5 пунктах",
  "Предложи план апсейла и кросс-сейла",
  "Оцени вероятность повторной покупки и что её повысит",
];

interface ChatMessage { role: "user" | "assistant"; content: string; }

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-[#516895]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

// ── Model list ────────────────────────────────────────────────────────────────
interface AiModelOption { label: string; provider: string; model: string; free: boolean }

const FALLBACK_MODELS: AiModelOption[] = [
  { label: "Groq · Llama 3.3 70B",  provider: "groq",       model: "llama-3.3-70b-versatile",                free: true },
  { label: "Gemini 2.5 Flash",       provider: "openrouter", model: "google/gemini-2.5-flash",                free: true },
  { label: "Llama 3.3 70B",          provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", free: true },
  { label: "DeepSeek R1",            provider: "openrouter", model: "deepseek/deepseek-r1:free",              free: true },
  { label: "Mistral 7B",             provider: "openrouter", model: "mistralai/mistral-7b-instruct:free",     free: true },
];

const MODEL_STORAGE_KEY = "crm_ai_model";

function loadSavedModel(): { provider: string; model: string } | null {
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as { provider: string; model: string } : null;
  } catch { return null; }
}

// ── Main panel ───────────────────────────────────────────────────────────────
export default function CustomerAiPanel({ customerId, customerName }: {
  customerId: number;
  customerName: string;
}) {
  const [tab, setTab]               = useState<"analysis" | "chat">("analysis");
  const [anonymized, setAnonymized] = useState(true);
  const [wish, setWish]             = useState("");
  const [preset, setPreset]         = useState(WISH_PRESETS[0]);

  const [modelList, setModelList]               = useState<AiModelOption[]>(FALLBACK_MODELS);
  const saved = loadSavedModel();
  const [selectedProvider, setSelectedProvider] = useState<string>(saved?.provider ?? FALLBACK_MODELS[0].provider);
  const [selectedModel, setSelectedModel]       = useState<string>(saved?.model    ?? FALLBACK_MODELS[0].model);

  const [analysis, setAnalysis]     = useState<string | null>(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [lastMeta, setLastMeta]     = useState<{ at: Date; anon: boolean; model: string; provider: string } | null>(null);

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr]         = useState<string | null>(null);
  const [clearing, setClearing]       = useState(false);
  const [chatLoaded, setChatLoaded]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch full model list from API in background — updates the fallback list
  useEffect(() => {
    fetch("/api/ai/models")
      .then(r => r.ok ? r.json() as Promise<{ models: AiModelOption[] }> : null)
      .then(data => { if (data?.models?.length) setModelList(data.models); })
      .catch(() => {});
  }, []);

  function handleModelChange(combo: string) {
    const [prov, ...rest] = combo.split("|");
    const mdl = rest.join("|");
    setSelectedProvider(prov); setSelectedModel(mdl);
    try { localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify({ provider: prov, model: mdl })); } catch {}
  }

  // Reset when client changes
  useEffect(() => {
    setAnalysis(null);
    setAnalyzeErr(null);
    setLastMeta(null);
    setMessages([]);
    setChatLoaded(false);
    setChatInput("");
  }, [customerId]);

  useEffect(() => {
    if (chatLoaded) return;
    fetch(`/api/ai/customer/${customerId}/chat`)
      .then(r => r.ok ? r.json() as Promise<ChatMessage[]> : Promise.resolve([]))
      .then(msgs => { setMessages(msgs); setChatLoaded(true); })
      .catch(() => setChatLoaded(true));
  }, [customerId, chatLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const effectiveWish = preset === WISH_PRESETS[0] ? wish : preset;

  async function runAnalysis() {
    setAnalyzing(true); setAnalyzeErr(null); setAnalysis(null);
    const res  = await fetch(`/api/ai/customer/${customerId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymized, wish: effectiveWish, provider: selectedProvider, model: selectedModel }),
    });
    const json = await res.json().catch(() => ({})) as { analysis?: string; error?: string; model?: string; provider?: string };
    setAnalyzing(false);
    if (!res.ok || !json.analysis) setAnalyzeErr(json.error ?? "Ошибка AI анализа");
    else {
      setAnalysis(json.analysis);
      setLastMeta({ at: new Date(), anon: anonymized, model: json.model ?? "—", provider: json.provider ?? "—" });
    }
  }

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput(""); setChatErr(null);
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setChatLoading(true);
    const res  = await fetch(`/api/ai/customer/${customerId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, provider: selectedProvider, model: selectedModel }),
    });
    const json = await res.json().catch(() => ({})) as { reply?: string; error?: string };
    setChatLoading(false);
    if (!res.ok || !json.reply) setChatErr(json.error ?? "Ошибка AI");
    else setMessages(prev => [...prev, { role: "assistant", content: json.reply! }]);
  }, [chatInput, chatLoading, customerId]);

  async function clearChat() {
    if (!confirm("Очистить весь диалог с ИИ?")) return;
    setClearing(true);
    await fetch(`/api/ai/customer/${customerId}/chat`, { method: "DELETE" }).catch(() => {});
    setMessages([]); setClearing(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white">

      {/* ── Header ── */}
      <div className="shrink-0 bg-linear-to-r from-[#516895] to-[#3f5278] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-sm font-semibold">✨ ИИ-анализ</span>
            <span className="text-blue-200 text-xs truncate">· {customerName}</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
            <div
              onClick={() => setAnonymized(v => !v)}
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${anonymized ? "bg-blue-300" : "bg-white/30"}`}
            >
              <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${anonymized ? "left-4" : "left-0.5"}`} />
            </div>
            <span className="text-blue-100 text-xs">Скрывать ПДн</span>
          </label>
        </div>
        {anonymized && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-200 bg-white/10 rounded-lg px-2.5 py-1.5">
            <span>🔒</span>
            <span>Обезличенный режим — персональные данные не передаются</span>
          </div>
        )}
      </div>

      {/* ── Model selector ── */}
      {modelList.length > 0 && (
        <div className="shrink-0 px-3 pt-2 pb-1.5 border-b border-[#c8d3e8] bg-white flex items-center gap-2">
          <span className="text-[10px] text-gray-400 shrink-0 uppercase tracking-wide">Модель</span>
          <select
            value={`${selectedProvider}|${selectedModel}`}
            onChange={e => handleModelChange(e.target.value)}
            className="flex-1 text-xs border border-[#c8d3e8] rounded-lg px-2 py-1 bg-white text-gray-700 outline-none focus:border-[#516895] transition"
          >
            {modelList.map(m => (
              <option key={`${m.provider}|${m.model}`} value={`${m.provider}|${m.model}`}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Wish row ── */}
      <div className="shrink-0 px-3 py-2 border-b border-[#c8d3e8] bg-gray-50 flex gap-2 items-center">
        <select
          value={preset}
          onChange={e => { setPreset(e.target.value); if (e.target.value !== WISH_PRESETS[0]) setWish(""); }}
          className="text-xs border border-[#c8d3e8] rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none flex-1 min-w-0"
        >
          {WISH_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {preset === WISH_PRESETS[0] && (
          <input type="text" placeholder="Своё пожелание..." value={wish}
            onChange={e => setWish(e.target.value)}
            className="text-xs border border-[#c8d3e8] rounded-lg px-2 py-1.5 outline-none focus:border-[#516895] w-36 shrink-0"
          />
        )}
      </div>

      {/* ── Sub-tabs ── */}
      <div className="shrink-0 flex border-b border-[#c8d3e8] bg-white">
        {(["analysis", "chat"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition border-b-2 -mb-px ${
              tab === t ? "border-[#516895] text-[#516895]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t === "analysis" ? "Анализ" : "Диалог с ИИ"}
          </button>
        ))}
        <div className="flex items-center px-2">
          {tab === "analysis" && (
            <button onClick={runAnalysis} disabled={analyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#516895] text-white hover:bg-[#3f5278] disabled:opacity-60 transition">
              {analyzing ? <Spinner /> : <span>✦</span>}
              {analyzing ? "Анализ..." : "Новый анализ"}
            </button>
          )}
          {tab === "chat" && messages.length > 0 && (
            <button onClick={clearChat} disabled={clearing}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition">
              Очистить
            </button>
          )}
        </div>
      </div>

      {/* ── Analysis tab ── */}
      {tab === "analysis" && (
        <div className="flex-1 overflow-y-auto p-4">
          {!analysis && !analyzing && !analyzeErr && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#516895]/10 flex items-center justify-center text-2xl">✨</div>
              <div className="text-sm font-medium text-gray-600">Готов к анализу</div>
              <div className="text-xs text-gray-400 max-w-50">Нажмите «Новый анализ» — ИИ изучит клиента и даст рекомендации</div>
            </div>
          )}
          {analyzing && (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-3">
              <Spinner />
              <div className="text-xs text-gray-400">Анализируем данные клиента...</div>
            </div>
          )}
          {analyzeErr && (
            <div className="mt-4 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{analyzeErr}</div>
          )}
          {analysis && !analyzing && (
            <MarkdownBlock text={analysis} />
          )}
        </div>
      )}

      {/* ── Status bar ── */}
      {lastMeta && (
        <div className="shrink-0 border-t border-[#c8d3e8] px-3 py-1.5 bg-gray-50 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-gray-400">
            Запись от {lastMeta.at.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-gray-300">·</span>
          <span className={`text-[10px] ${lastMeta.anon ? "text-blue-500" : "text-amber-500"}`}>
            {lastMeta.anon ? "обезличенный" : "с ПДн"}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-[10px] text-gray-400">{lastMeta.provider}</span>
          <span className="text-gray-300">·</span>
          <span className="text-[10px] text-gray-400 font-mono truncate">{lastMeta.model}</span>
        </div>
      )}

      {/* ── Chat tab ── */}
      {tab === "chat" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-gray-50">
            {!chatLoaded && (
              <div className="flex justify-center py-8"><Spinner /></div>
            )}
            {chatLoaded && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-[#516895]/10 flex items-center justify-center text-xl">💬</div>
                <div className="text-xs text-gray-500 max-w-50">
                  Задайте вопрос об этом клиенте — ИИ ответит на основе данных CRM
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-[#516895] flex items-center justify-center text-white text-[10px] shrink-0 mt-1 mr-2">
                    ИИ
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                  m.role === "user"
                    ? "bg-[#516895] text-white rounded-tr-sm"
                    : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
                }`}>
                  {m.role === "assistant"
                    ? <MarkdownBlock text={m.content} small />
                    : <span className="whitespace-pre-wrap text-xs">{m.content}</span>
                  }
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#516895] flex items-center justify-center text-white text-[10px] shrink-0">ИИ</div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-[#516895] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatErr && <div className="text-xs text-red-500 px-1">{chatErr}</div>}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-[#c8d3e8] p-2.5 flex gap-2 items-end bg-white">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Спросите что-нибудь... (Enter — отправить)"
              rows={2}
              disabled={chatLoading}
              className="flex-1 resize-none border border-[#c8d3e8] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#516895] disabled:opacity-50 bg-gray-50"
            />
            <button
              onClick={sendMessage}
              disabled={chatLoading || !chatInput.trim()}
              className="p-2.5 bg-[#516895] text-white rounded-xl hover:bg-[#3f5278] disabled:opacity-50 transition shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}>
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
