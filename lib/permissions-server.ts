// Server-side permission lookup. The role and active flag are read from
// AGRO_USERS on every check (not taken from the JWT), so a role change or a
// deactivated account takes effect without waiting for the 7-day token to
// expire. Cached briefly on globalThis — proxy.ts and the route handlers are
// separate bundles but share the process, so one invalidation clears both.
import { query } from "@/lib/oracle";
import { isRole, resolvePermissions, type PermissionMap, type Role } from "@/lib/permissions";

const TTL_MS = 30_000;

interface UserAccess { id: number; username: string; role: Role; active: boolean; perms: PermissionMap }
interface Cache {
  users: Map<number, { at: number; value: UserAccess | null }>;
  roles: Map<Role, { at: number; value: PermissionMap }>;
}

declare global {
  var _crmPermCache: Cache | undefined;
}

function cache(): Cache {
  globalThis._crmPermCache ??= { users: new Map(), roles: new Map() };
  return globalThis._crmPermCache;
}

export function invalidatePermissions() {
  cache().users.clear();
  cache().roles.clear();
}

export async function rolePermissions(role: Role): Promise<PermissionMap> {
  const hit = cache().roles.get(role);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let overrides: Record<string, string> = {};
  if (role !== "admin") {
    try {
      const rows = await query<{ MODULE: string; ACCESS_LEVEL: string }>(
        `SELECT MODULE, ACCESS_LEVEL FROM AGRO_CRM_ROLE_PERMISSIONS WHERE ROLE = :1`, [role]);
      overrides = Object.fromEntries(rows.map(r => [r.MODULE, r.ACCESS_LEVEL]));
    } catch { /* table missing — defaults only */ }
  }
  const value = resolvePermissions(role, overrides);
  cache().roles.set(role, { at: Date.now(), value });
  return value;
}

export async function userAccess(userId: number): Promise<UserAccess | null> {
  const hit = cache().users.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const rows = await query<{ ID: number; USERNAME: string; ROLE: string; ACTIVE: string }>(
    `SELECT ID, USERNAME, ROLE, ACTIVE FROM AGRO_USERS WHERE ID = :1`, [userId]);
  let value: UserAccess | null = null;
  if (rows.length) {
    const r = rows[0];
    // An unknown role value gets the most restrictive configurable role.
    const role: Role = isRole(r.ROLE) ? r.ROLE : "viewer";
    value = { id: Number(r.ID), username: r.USERNAME, role, active: r.ACTIVE === "Y", perms: await rolePermissions(role) };
  }
  cache().users.set(userId, { at: Date.now(), value });
  return value;
}
