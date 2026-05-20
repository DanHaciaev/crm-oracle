import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { fetchEmailByUid, markAsRead, deleteEmail } from "@/lib/gmail";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { uid: uidStr } = await params;
  const uid = parseInt(uidStr, 10);
  if (isNaN(uid)) return NextResponse.json({ error: "Неверный uid" }, { status: 400 });

  try {
    const email = await fetchEmailByUid(uid);
    if (!email) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });

    // mark as read in background (don't await — response faster)
    markAsRead(uid).catch(() => {});

    return NextResponse.json(email);
  } catch (err) {
    console.error("IMAP fetch error:", err);
    return NextResponse.json({ error: "Ошибка получения письма" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { uid: uidStr } = await params;
  const uid = parseInt(uidStr, 10);
  if (isNaN(uid)) return NextResponse.json({ error: "Неверный uid" }, { status: 400 });

  try {
    await deleteEmail(uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("IMAP delete error:", err);
    return NextResponse.json({ error: "Ошибка удаления письма" }, { status: 500 });
  }
}
