import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";
import { PayError } from "@/lib/receivables";

// Shared wrapper for /api/receivables and /api/payments: resolves the user
// (for CREATED_BY) and maps validation errors to 400. Section access itself
// ("payments" view / edit) is enforced in proxy.ts.
export async function withUser(fn: (username: string) => Promise<unknown>) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    return NextResponse.json(await fn(user.username));
  } catch (e) {
    if (e instanceof PayError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[payments]", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
