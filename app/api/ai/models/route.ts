import { NextResponse } from "next/server";
import { getActiveProvider, getActiveModel } from "@/lib/ai";

interface OpenRouterModel {
  id: string; name: string;
  pricing: { prompt: string; completion: string };
}
interface GroqModel { id: string; }

// In-memory cache — refresh every 10 minutes
let cache: { models: AiModelOption[]; at: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export interface AiModelOption {
  label: string; provider: string; model: string;
}

async function fetchOpenRouterModels(): Promise<AiModelOption[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const data = await res.json() as { data: OpenRouterModel[] };
  return data.data
    .filter(m => m.pricing.prompt === "0" && m.pricing.completion === "0")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(m => ({ label: m.name, provider: "openrouter", model: m.id }));
}

async function fetchGroqModels(): Promise<AiModelOption[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const data = await res.json() as { data: GroqModel[] };
  return data.data
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({ label: `Groq · ${m.id}`, provider: "groq", model: m.id }));
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json({ models: cache.models, defaultProvider: getActiveProvider(), defaultModel: getActiveModel() });
  }

  const [groq, openrouter] = await Promise.allSettled([
    fetchGroqModels(),
    fetchOpenRouterModels(),
  ]);

  const models: AiModelOption[] = [
    ...(groq.status        === "fulfilled" ? groq.value        : []),
    ...(openrouter.status  === "fulfilled" ? openrouter.value  : []),
  ];

  cache = { models, at: Date.now() };

  return NextResponse.json({
    models,
    defaultProvider: getActiveProvider(),
    defaultModel:    getActiveModel(),
  });
}
