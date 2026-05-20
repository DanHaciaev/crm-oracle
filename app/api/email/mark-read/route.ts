import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { markAsRead } from "@/lib/gmail";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(req: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { uid } = await req.json() as { uid?: number };
  if (!uid) return NextResponse.json({ error: "uid обязателен" }, { status: 400 });

  try {
    await markAsRead(uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("IMAP mark-read error:", err);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
