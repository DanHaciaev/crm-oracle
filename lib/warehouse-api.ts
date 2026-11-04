import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { parseLang, type Lang } from "@/lib/documents/common";
import { userAccess } from "@/lib/permissions-server";
import { ActionError } from "@/lib/warehouse";

// Shared wrapper for /api/warehouse/* — section access itself is enforced
// by proxy.ts; this resolves the user (for "blocked by …") and the language.
export async function handle(
  req: NextRequest,
  fn: (ctx: { lang: Lang; sp: URLSearchParams; username: string }) => Promise<unknown>,
) {
  const store = await cookies();
  const token = store.get("token")?.value;
  const payload = token ? verifyToken(token) : null;
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await fn({ lang: parseLang(sp.get("lang")), sp, username: user.username }));
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(`[warehouse] ${req.nextUrl.pathname}`, e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
