import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";

// Wrapper for read-only routes over DIPP FRUICT tables (field requests,
// export declarations). Section access is enforced in proxy.ts.
export async function readOnly(tag: string, fn: () => Promise<unknown>) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    console.error(`[${tag}]`, e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
