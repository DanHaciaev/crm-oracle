import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { groqChat } from "@/lib/groq";

const SEGMENT_LABELS: Record<string, string> = {
  all:      "все клиенты",
  vip:      "VIP-клиенты (самые крупные покупатели)",
  active:   "активные клиенты",
  new:      "новые клиенты",
  sleeping: "спящие клиенты (давно не покупали)",
  churned:  "потерянные клиенты",
};

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { segment, hint } = await req.json().catch(() => ({})) as { segment?: string; hint?: string };

  const segmentLabel = SEGMENT_LABELS[segment ?? "all"] ?? "все клиенты";
  const topic = hint?.trim() || "общая информация о компании";

  const system = `Ты — маркетолог CRM-системы агро-компании.
Пишешь короткие Telegram-сообщения для рассылки клиентам.
Сообщение должно быть на русском языке, дружелюбным, конкретным и не более 300 символов.
Не используй markdown-разметку. Не добавляй приветствие "Уважаемые" — начни сразу по делу.`;

  const user = `Напиши текст рассылки для сегмента: ${segmentLabel}.
Тема: ${topic}.
Верни только текст сообщения, без пояснений.`;

  try {
    const text = await groqChat(system, user);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "Ошибка AI генерации" }, { status: 500 });
  }
}
