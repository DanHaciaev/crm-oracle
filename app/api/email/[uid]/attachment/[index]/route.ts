import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { getAttachment } from "@/lib/gmail";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string; index: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { uid: uidStr, index: indexStr } = await params;
  const uid   = parseInt(uidStr, 10);
  const index = parseInt(indexStr, 10);
  if (isNaN(uid) || isNaN(index)) {
    return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  }

  try {
    const att = await getAttachment(uid, index);
    if (!att) return NextResponse.json({ error: "Вложение не найдено" }, { status: 404 });

    const safeName = encodeURIComponent(att.filename);
    return new Response(att.content, {
      headers: {
        "Content-Type":        att.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${safeName}`,
        "Content-Length":      String(att.content.length),
        "Cache-Control":       "private, max-age=600",
      },
    });
  } catch (err) {
    console.error("Attachment download error:", err);
    return NextResponse.json({ error: "Ошибка загрузки вложения" }, { status: 500 });
  }
}
