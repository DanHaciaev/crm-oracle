import Groq from "groq-sdk";
import OpenAI from "openai";

type Message = { role: "system" | "user" | "assistant"; content: string };
type Provider = "groq" | "openrouter" | "ollama";

// ── Default provider from env ────────────────────────────────────────────────

function defaultProvider(): Provider {
  const p = process.env.AI_PROVIDER ?? "groq";
  if (p === "openrouter" || p === "ollama") return p;
  return "groq";
}

function defaultModel(prov: Provider): string {
  if (prov === "groq")       return "llama-3.3-70b-versatile";
  if (prov === "openrouter") return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
  return process.env.OLLAMA_MODEL ?? "llama3.2";
}

export function getActiveModel(): string    { return defaultModel(defaultProvider()); }
export function getActiveProvider(): string { return defaultProvider(); }


// ── Low-level completion ─────────────────────────────────────────────────────

function buildOpenAIClient(prov: Provider): OpenAI {
  if (prov === "openrouter") {
    return new OpenAI({
      apiKey:  process.env.OPENROUTER_API_KEY ?? "",
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.BASE_URL ?? "http://localhost:3000",
        "X-Title": "CRM Oracle",
      },
    });
  }
  return new OpenAI({
    apiKey:  "ollama",
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  });
}

async function complete(
  prov: Provider, mdl: string,
  messages: Message[], maxTokens: number, temp: number
): Promise<string> {
  if (prov === "groq") {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const res  = await groq.chat.completions.create({
      model: mdl, messages, max_tokens: maxTokens, temperature: temp,
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  }
  const client = buildOpenAIClient(prov);
  const res    = await client.chat.completions.create({
    model: mdl, messages, max_tokens: maxTokens, temperature: temp,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

// ── Public API — accepts explicit provider/model or falls back to env ────────

export async function aiChat(
  systemPrompt: string, userPrompt: string,
  prov?: string, mdl?: string,
): Promise<string> {
  const p = (prov ?? defaultProvider()) as Provider;
  const m = mdl ?? defaultModel(p);
  return complete(p, m, [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userPrompt },
  ], 600, 0.7);
}

export async function aiAnalysis(
  systemPrompt: string, userPrompt: string,
  prov?: string, mdl?: string,
): Promise<string> {
  const p = (prov ?? defaultProvider()) as Provider;
  const m = mdl ?? defaultModel(p);
  return complete(p, m, [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userPrompt },
  ], 2400, 0.4);
}

export async function aiChatTurn(
  messages: Message[],
  prov?: string, mdl?: string,
): Promise<string> {
  const p = (prov ?? defaultProvider()) as Provider;
  const m = mdl ?? defaultModel(p);
  return complete(p, m, messages, 1200, 0.5);
}
