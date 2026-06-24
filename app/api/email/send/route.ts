import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";
import { syncOutboundEmail } from "@/lib/email-db";
import { randomUUID } from "crypto";

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

  const subject = body.subject?.trim() ?? "(без темы)";
  const text    = body.text.trim();
  const to      = body.to.trim();

  try {
    await sendEmail({ to, subject, text, inReplyTo: body.inReplyTo, references: body.references });

    const smtpUser = process.env.SMTP_USER ?? "";
    syncOutboundEmail({
      messageId: randomUUID(),
      to,
      from: smtpUser,
      subject,
      text,
      sentAt: new Date(),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("SMTP send error:", err);
    return NextResponse.json({ error: "Ошибка отправки письма" }, { status: 500 });
  }
}
