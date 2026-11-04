import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

// The signed-in user (fresh from AGRO_USERS, incl. password hash) for the
// /api/account routes, which only ever act on the caller's own account.
export async function currentAccount() {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  if (!payload) return null;
  const rows = await query<{ ID: number; USERNAME: string; FIRST_NAME: string | null; LAST_NAME: string | null;
                             ROLE: string; PASSWORD_HASH: string; ACTIVE: string }>(
    `SELECT ID, USERNAME, FIRST_NAME, LAST_NAME, ROLE, PASSWORD_HASH, ACTIVE FROM AGRO_USERS WHERE ID = :1`, [payload.id]);
  const u = rows[0];
  return u && u.ACTIVE === "Y" ? u : null;
}

export const MIN_PASSWORD = 8;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Пароль должен быть не короче ${MIN_PASSWORD} символов`;
  if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return "Пароль должен содержать буквы и цифры";
  return null;
}

export async function loginHistory(where: string, binds: Record<string, string | number>, limit = 50) {
  const rows = await query<Record<string, unknown>>(`
    SELECT * FROM (
      SELECT ID, USER_ID, USERNAME, SUCCESS, REASON, IP, USER_AGENT, CREATED_AT
      FROM AGRO_CRM_LOGIN_LOG ${where} ORDER BY CREATED_AT DESC, ID DESC
    ) WHERE ROWNUM <= :lim`, { ...binds, lim: limit });
  return rows.map(r => ({
    id: Number(r.ID), user_id: r.USER_ID != null ? Number(r.USER_ID) : null, username: String(r.USERNAME ?? ""),
    success: r.SUCCESS === "Y", reason: r.REASON ? String(r.REASON) : null,
    ip: r.IP ? String(r.IP) : null, user_agent: r.USER_AGENT ? String(r.USER_AGENT) : null,
    created_at: r.CREATED_AT instanceof Date ? r.CREATED_AT.toISOString() : String(r.CREATED_AT ?? ""),
  }));
}
