import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";
import { QuoteError } from "@/lib/quotes";

// Wrapper for /api/quotes/*: resolves the user (for CREATED_BY / audit) and
// maps validation errors to 400. Section access ("quotes" view / edit) is
// enforced in proxy.ts.
export async function withQuoteUser(fn: (username: string) => Promise<unknown>) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    const out = await fn(user.username);
    return out instanceof NextResponse ? out : NextResponse.json(out);
  } catch (e) {
    if (e instanceof QuoteError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[quotes]", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
