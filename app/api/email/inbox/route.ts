import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { fetchInbox } from "@/lib/gmail";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return NextResponse.json({ error: "Gmail не настроен. Добавьте SMTP_USER и SMTP_PASSWORD в .env" }, { status: 503 });
  }

  try {
    const emails = await fetchInbox(50);
    return NextResponse.json(emails);
  } catch (err) {
    console.error("IMAP inbox error:", err);
    return NextResponse.json({ error: "Не удалось получить почту. Проверьте App Password." }, { status: 500 });
  }
}
