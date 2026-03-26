import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/oracle";

interface UserRow extends Record<string, unknown> {
  ID: number;
  EMAIL: string;
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  ROLE: string;
  AVATAR_URL: string | null;
  CREATED_AT: string;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
  }

  const users = await query<UserRow>(
    `SELECT id, email, first_name, last_name, role, avatar_url, created_at
     FROM crm_user.users WHERE id = :1`,
    [payload.id]
  );

  if (users.length === 0) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const user = users[0];
  return NextResponse.json({
    id:         String(user.ID),
    email:      user.EMAIL,
    first_name: user.FIRST_NAME,
    last_name:  user.LAST_NAME,
    role:       user.ROLE,
    avatar_url: user.AVATAR_URL,
    created_at: user.CREATED_AT,
  });
}