import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";
import { DirError, saveDirectory } from "@/lib/directories";

// PUT — edit a record (incl. { active: false } to deactivate). No DELETE on
// purpose: shared records are deactivated, never removed.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    return NextResponse.json(await saveDirectory(kind, Number(id), await req.json().catch(() => ({})), user.username));
  } catch (e) {
    if (e instanceof DirError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(`[directories/${kind}/${id}]`, e);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
