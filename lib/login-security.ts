import { NextResponse, type NextRequest } from "next/server";
import { query, execute } from "@/lib/oracle";
import { signToken } from "@/lib/auth";
import { isRole } from "@/lib/permissions";

// Brute-force lock: this many failed attempts for one username within the
// window blocks further attempts until the window passes.
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export function clientInfo(req: NextRequest | Request) {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null;
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 400) || null };
}

export async function recordLogin(req: NextRequest | Request, opts: {
  userId: number | null; username: string; success: boolean; reason?: string;
}) {
  const { ip, ua } = clientInfo(req);
  try {
    await execute(
      `INSERT INTO AGRO_CRM_LOGIN_LOG (USER_ID, USERNAME, SUCCESS, REASON, IP, USER_AGENT)
       VALUES (:p_user, :p_name, :p_ok, :p_reason, :p_ip, :p_ua)`,
      // (":uid" can't be used — UID is an Oracle reserved word, ORA-01745)
      { p_user: opts.userId, p_name: opts.username.slice(0, 100), p_ok: opts.success ? "Y" : "N",
        p_reason: opts.reason ?? null, p_ip: ip, p_ua: ua });
  } catch (e) {
    console.error("[login-log]", e);  // logging must never block a sign-in
  }
}

// Failed attempts since the last success, inside the lock window.
export async function isLocked(username: string) {
  const rows = await query<{ N: number }>(`
    SELECT COUNT(*) AS N FROM AGRO_CRM_LOGIN_LOG
     WHERE USERNAME = :u AND SUCCESS = 'N'
       AND CREATED_AT > SYSDATE - :mins / 1440
       AND CREATED_AT > NVL((SELECT MAX(CREATED_AT) FROM AGRO_CRM_LOGIN_LOG WHERE USERNAME = :u AND SUCCESS = 'Y'), SYSDATE - 1)`,
    { u: username.slice(0, 100), mins: LOCK_MINUTES });
  return Number(rows[0]?.N ?? 0) >= MAX_FAILURES;
}

export async function twoFactorSecret(userId: number): Promise<string | null> {
  const rows = await query<{ SECRET_ENC: string | null; ENABLED: string }>(
    `SELECT SECRET_ENC, ENABLED FROM AGRO_CRM_USER_2FA WHERE USER_ID = :1`, [userId]);
  return rows[0]?.ENABLED === "Y" && rows[0].SECRET_ENC ? rows[0].SECRET_ENC : null;
}

// Issues the 7-day session cookie after a successful sign-in.
export function sessionResponse(user: { ID: number; USERNAME: string; ROLE: string }) {
  const role  = isRole(user.ROLE) ? user.ROLE : "viewer";
  const token = signToken({ id: Number(user.ID), username: user.USERNAME, role });

  const response = NextResponse.json({ success: true, role });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === "true",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 7,
  });
  return response;
}
