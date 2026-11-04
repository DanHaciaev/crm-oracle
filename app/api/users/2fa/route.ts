import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";

// DELETE { id } — admin resets a user's 2FA (lost phone). The user signs in
// with the password only and can set 2FA up again in their account.
export async function DELETE(request: Request) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const me = payload ? await userAccess(payload.id) : null;
  if (!me?.active || me.role !== "admin") return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
  const { id } = await request.json().catch(() => ({}));
  if (!Number(id)) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  await execute(`DELETE FROM AGRO_CRM_USER_2FA WHERE USER_ID = :1`, [Number(id)]);
  await execute(
    `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ACTION, CHANGED_BY) VALUES ('user', :id, '2fa_reset', :by)`,
    { id: Number(id), by: me.username });
  return NextResponse.json({ success: true });
}
