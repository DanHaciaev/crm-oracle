import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { comparePassword, hashPassword } from "@/lib/auth";
import { currentAccount, loginHistory, passwordProblem } from "@/lib/account";
import { recordLogin } from "@/lib/login-security";

// GET — own profile, 2FA state and the last sign-ins of this account.
export async function GET() {
  const u = await currentAccount();
  if (!u) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const tfa = await query<{ ENABLED: string }>(`SELECT ENABLED FROM AGRO_CRM_USER_2FA WHERE USER_ID = :1`, [u.ID]);
  return NextResponse.json({
    id: u.ID, username: u.USERNAME, first_name: u.FIRST_NAME, last_name: u.LAST_NAME, role: u.ROLE,
    two_factor: tfa[0]?.ENABLED === "Y",
    logins: await loginHistory("WHERE USERNAME = :u", { u: u.USERNAME }, 20),
  });
}

// PATCH { current_password, new_password } — change own password. Same
// scrypt hash format as Artgranit (werkzeug), so it works there too.
export async function PATCH(request: Request) {
  const u = await currentAccount();
  if (!u) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { current_password, new_password } = await request.json().catch(() => ({}));
  if (!current_password || !comparePassword(String(current_password), u.PASSWORD_HASH)) {
    await recordLogin(request, { userId: u.ID, username: u.USERNAME, success: false, reason: "pw_change_bad_current" });
    return NextResponse.json({ error: "Текущий пароль указан неверно" }, { status: 400 });
  }
  const problem = passwordProblem(String(new_password ?? ""));
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (comparePassword(String(new_password), u.PASSWORD_HASH))
    return NextResponse.json({ error: "Новый пароль совпадает с текущим" }, { status: 400 });

  await execute(`UPDATE AGRO_USERS SET PASSWORD_HASH = :1 WHERE ID = :2`, [hashPassword(String(new_password)), u.ID]);
  await execute(
    `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY) VALUES ('user', :id, :name, 'password_change', :name)`,
    { id: u.ID, name: u.USERNAME });
  return NextResponse.json({ success: true });
}
