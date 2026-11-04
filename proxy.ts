import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { apiAllowed, can, PUBLIC_API, type PermissionMap, type Role } from "@/lib/permissions";

// Manual "run now" from the UI: automations from Broadcasts, the daily
// report from Managers; every other job is admin-only.
function cronAllowed(role: Role, perms: PermissionMap, path: string) {
  if (role === "admin") return true;
  if (path === "/api/cron/automations") return can(perms, "broadcasts", "edit");
  if (path === "/api/cron/report") return can(perms, "managers", "view");
  return false;
}
import { userAccess } from "@/lib/permissions-server";

// Single place where role permissions are enforced for every /api route
// (lib/permissions.ts API_RULES maps path prefix → section; GET needs view,
// writes need edit). Route handlers keep their own token / admin checks on
// top of this. Proxy runs on the Node.js runtime, so it can verify the JWT
// and read AGRO_USERS directly.
export async function proxy(request: NextRequest) {
  const path  = request.nextUrl.pathname;
  const token = request.cookies.get("token")?.value;

  if (!path.startsWith("/api/")) {
    if (token && path === "/") return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (PUBLIC_API.some(p => p.endsWith("/") ? path.startsWith(p) : path === p)) return NextResponse.next();

  // Cron jobs: the scheduler sends x-cron-secret; without it, only a
  // signed-in user with the right access may trigger one (the "run now"
  // buttons). Fails closed when CRON_SECRET isn't configured.
  const isCron = path.startsWith("/api/cron/");
  const secret = process.env.CRON_SECRET;
  if (isCron && secret && request.headers.get("x-cron-secret") === secret) return NextResponse.next();

  const payload = token ? verifyToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let user;
  try {
    user = await userAccess(payload.id);
  } catch (e) {
    console.error("[proxy] permission lookup failed", e);
    return NextResponse.json({ error: "Сервис временно недоступен" }, { status: 503 });
  }
  if (!user || !user.active) return NextResponse.json({ error: "Пользователь отключён" }, { status: 401 });

  if (isCron && !cronAllowed(user.role, user.perms, path)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (apiAllowed(user.perms, path, request.method) === false) {
    return NextResponse.json({ error: "Нет доступа к этому разделу" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
