import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function POST(req: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json() as {
    to?: string;
    subject?: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
  };

  if (!body.to?.trim()) return NextResponse.json({ error: "Поле 'to' обязательно" }, { status: 400 });
  if (!body.text?.trim()) return NextResponse.json({ error: "Текст письма не может быть пустым" }, { status: 400 });

  try {
    await sendEmail({
      to: body.to.trim(),
      subject: body.subject?.trim() ?? "(без темы)",
      text: body.text.trim(),
      inReplyTo: body.inReplyTo,
      references: body.references,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("SMTP send error:", err);
    return NextResponse.json({ error: "Ошибка отправки письма" }, { status: 500 });
  }
}
