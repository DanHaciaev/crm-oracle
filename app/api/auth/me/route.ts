import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/oracle";

interface UserRow {
  ID:         number;
  USERNAME:   string;
  FIRST_NAME: string | null;
  LAST_NAME:  string | null;
  ROLE:       "admin" | "manager";
  CREATED_AT: string | Date;
}

export async function GET() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
  }

  const users = await query<UserRow>(
    `SELECT id, username, first_name, last_name, role, created_at
       FROM AGRO_USERS
      WHERE id = :1 AND active = 'Y'`,
    [payload.id]
  );

  if (users.length === 0) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const u = users[0];
  return NextResponse.json({
    id:         u.ID,
    username:   u.USERNAME,
    first_name: u.FIRST_NAME,
    last_name:  u.LAST_NAME,
    role:       u.ROLE,
    created_at: u.CREATED_AT instanceof Date ? u.CREATED_AT.toISOString() : String(u.CREATED_AT ?? ""),
  });
}
