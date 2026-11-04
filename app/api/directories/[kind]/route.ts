import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { parseLang } from "@/lib/documents/common";
import { userAccess } from "@/lib/permissions-server";
import { DirError, listDirectory, saveDirectory } from "@/lib/directories";

// Reference tables. Read needs "directories" view, writes need edit (proxy.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  try {
    return NextResponse.json(await listDirectory(kind, parseLang(req.nextUrl.searchParams.get("lang"))));
  } catch (e) {
    if (e instanceof DirError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    return NextResponse.json(await saveDirectory(kind, null, await req.json().catch(() => ({})), user.username));
  } catch (e) {
    if (e instanceof DirError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(`[directories/${kind}]`, e);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
