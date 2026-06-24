import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await execute(`UPDATE AGRO_CRM_APP_USERS SET UNREAD_COUNT = 0 WHERE UNREAD_COUNT > 0`, []);
  return NextResponse.json({ success: true });
}
