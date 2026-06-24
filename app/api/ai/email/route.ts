import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { groqChat } from "@/lib/groq";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { hint, to, lang } = await req.json().catch(() => ({})) as {
    hint?: string;
    to?:   string;
    lang?: string;
  };

  const topic    = hint?.trim() || "деловое письмо";
  const recipient = to?.trim()   || "клиенту";
  const language  = lang === "ro" ? "румынском" : lang === "en" ? "английском" : "русском";

  const system = `Ты — деловой ассистент агро-компании. Пишешь деловые email письма.
Тон: профессиональный, вежливый, конкретный. Письмо должно быть на ${language} языке.
Верни ТОЛЬКО JSON объект без пояснений: {"subject":"...","body":"..."}
Subject — тема письма (до 80 символов). Body — текст письма (2–4 абзаца).`;

  const user = `Напиши email письмо для: ${recipient}.
Тема/задача: ${topic}.
Верни JSON объект: {"subject":"...","body":"..."}`;

  try {
    const raw  = await groqChat(system, user);
    const json = JSON.parse(raw.replace(/```json\n?|```/g, "").trim()) as { subject?: string; body?: string };
    return NextResponse.json({ subject: json.subject ?? "", body: json.body ?? "" });
  } catch {
    return NextResponse.json({ error: "Ошибка AI генерации" }, { status: 500 });
  }
}
