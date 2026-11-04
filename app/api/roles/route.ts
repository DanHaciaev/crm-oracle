import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import {
  CONFIGURABLE_ROLES, DEFAULTS, MODULES, VIEW_ONLY_MODULES,
  type Access, type ConfigurableRole, type Module,
} from "@/lib/permissions";
import { invalidatePermissions, rolePermissions, userAccess } from "@/lib/permissions-server";

async function currentUser() {
  const store = await cookies();
  const token = store.get("token")?.value;
  const payload = token ? verifyToken(token) : null;
  return payload ? userAccess(payload.id) : null;
}

// Effective matrix for every configurable role + the built-in defaults, so
// the UI can show which cells differ from the default.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const roles = Object.fromEntries(await Promise.all(
    CONFIGURABLE_ROLES.map(async r => [r, await rolePermissions(r)] as const)));
  return NextResponse.json({ modules: MODULES, viewOnly: VIEW_ONLY_MODULES, roles, defaults: DEFAULTS });
}

// Body: { role, permissions: { module: level, … } } — the full matrix row
// for one role. Only cells that differ from the default are stored, so a
// later change of a default in code still reaches untouched cells.
// The role editor stays admin-only regardless of the "users" grant: a role
// that could edit this matrix could grant itself everything.
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только администратор может менять права" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const role = body.role as ConfigurableRole;
  const perms = (body.permissions ?? {}) as Record<string, string>;
  if (!CONFIGURABLE_ROLES.includes(role))
    return NextResponse.json({ error: "Неизвестная роль" }, { status: 400 });

  const rows: [Module, Access][] = [];
  for (const m of MODULES) {
    const v = perms[m];
    if (v !== "none" && v !== "view" && v !== "edit") continue;
    rows.push([m, VIEW_ONLY_MODULES.includes(m) && v === "edit" ? "view" : v]);
  }

  await execute(`DELETE FROM AGRO_CRM_ROLE_PERMISSIONS WHERE ROLE = :1`, [role]);
  for (const [m, level] of rows) {
    if (level === DEFAULTS[role][m]) continue;
    await execute(
      `INSERT INTO AGRO_CRM_ROLE_PERMISSIONS (ROLE, MODULE, ACCESS_LEVEL, UPDATED_BY, UPDATED_AT)
       VALUES (:1, :2, :3, :4, SYSDATE)`,
      [role, m, level, user.username]);
  }
  invalidatePermissions();

  const saved = await query<{ N: number }>(`SELECT COUNT(*) AS N FROM AGRO_CRM_ROLE_PERMISSIONS WHERE ROLE = :1`, [role]);
  return NextResponse.json({ success: true, permissions: await rolePermissions(role), overrides: Number(saved[0]?.N ?? 0) });
}
