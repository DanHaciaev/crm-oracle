import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";
import { loginHistory } from "@/lib/account";

// Sign-in history of all users (admin). ?username= narrows to one account,
// ?failed=1 to failed attempts only.
export async function GET(req: NextRequest) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const me = payload ? await userAccess(payload.id) : null;
  if (!me?.active || me.role !== "admin") return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const cond: string[] = [];
  const binds: Record<string, string> = {};
  const u = (sp.get("username") ?? "").trim();
  if (u) { cond.push("USERNAME = :u"); binds.u = u.slice(0, 100); }
  if (sp.get("failed") === "1") cond.push("SUCCESS = 'N'");
  return NextResponse.json(await loginHistory(cond.length ? "WHERE " + cond.join(" AND ") : "", binds, 300));
}
