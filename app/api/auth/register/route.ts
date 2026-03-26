import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password, first_name, last_name } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
  }

  // Проверяем существует ли пользователь
  const existing = await query<{ ID: number }>(
    `SELECT id FROM crm_user.users WHERE email = :1`,
    [email]
  );

  if (existing.length > 0) {
    return NextResponse.json({ error: "Пользователь уже существует" }, { status: 400 });
  }

  const passwordHash = hashPassword(password);

  // Создаём пользователя
  await execute(
    `INSERT INTO crm_user.users (email, password_hash, first_name, last_name, role)
     VALUES (:1, :2, :3, :4, 'user')`,
    [email, passwordHash, first_name ?? null, last_name ?? null]
  );

  // Получаем созданного пользователя
  const users = await query<{ ID: number; EMAIL: string; ROLE: string }>(
    `SELECT id, email, role FROM crm_user.users WHERE email = :1`,
    [email]
  );

  const user = users[0];
  const token = signToken({
    id:    String(user.ID),
    email: user.EMAIL,
    role:  user.ROLE,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 7, // 7 дней
  });

  return response;
}