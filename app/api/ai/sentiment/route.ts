import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { groqChat } from "@/lib/groq";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { text } = await req.json().catch(() => ({})) as { text?: string };
  if (!text?.trim())
    return NextResponse.json({ sentiment: "neutral", score: 50, label: "Нейтральное" });

  const system = `Ты анализируешь тональность деловых email писем.
Верни ТОЛЬКО JSON объект: {"sentiment":"positive"|"neutral"|"negative","score":0-100,"label":"Позитивное"|"Нейтральное"|"Негативное","summary":"краткое резюме 1 предложение"}
score: 0=очень негативно, 50=нейтрально, 100=очень позитивно.`;

  const user = `Проанализируй тональность этого письма:\n\n${text.slice(0, 2000)}`;

  try {
    const raw  = await groqChat(system, user);
    const json = JSON.parse(raw.replace(/```json\n?|```/g, "").trim()) as {
      sentiment?: string; score?: number; label?: string; summary?: string;
    };
    return NextResponse.json({
      sentiment: json.sentiment ?? "neutral",
      score:     json.score     ?? 50,
      label:     json.label     ?? "Нейтральное",
      summary:   json.summary   ?? "",
    });
  } catch {
    return NextResponse.json({ sentiment: "neutral", score: 50, label: "Нейтральное", summary: "" });
  }
}
