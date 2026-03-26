import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { execute } from "@/lib/oracle";

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  const payload     = token ? verifyToken(token) : null;

  if (!payload) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { first_name, last_name, role } = await request.json();
  const isAdmin = payload.role === "admin";

  if (isAdmin) {
    await execute(
      `UPDATE crm_user.users SET first_name = :1, last_name = :2, role = :3 WHERE id = :4`,
      [first_name || null, last_name || null, role, payload.id]
    );
  } else {
    await execute(
      `UPDATE crm_user.users SET first_name = :1, last_name = :2 WHERE id = :3`,
      [first_name || null, last_name || null, payload.id]
    );
  }

  return NextResponse.json({ success: true });
}