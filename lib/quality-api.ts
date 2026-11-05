import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";

// Wrapper for the read-only /api/quality/* routes. Section access
// ("quality" view) is enforced in proxy.ts.
export async function withQualityUser(fn: () => Promise<unknown>) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    const out = await fn();
    return out instanceof NextResponse ? out : NextResponse.json(out);
  } catch (e) {
    console.error("[quality]", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
