import { NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { comparePassword, signToken } from "@/lib/auth";

interface UserRow {
  [key: string]: unknown;
  ID:            number;
  USERNAME:      string;
  PASSWORD_HASH: string;
  ROLE:          "admin" | "manager";
  ACTIVE:        string;
}

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }

  const users = await query<UserRow>(
    `SELECT id, username, password_hash, role, active
       FROM AGRO_USERS
      WHERE username = :1`,
    [username]
  );

  if (users.length === 0) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const user = users[0];

  if (user.ACTIVE !== "Y") {
    return NextResponse.json({ error: "Пользователь отключён" }, { status: 403 });
  }

  if (!comparePassword(password, user.PASSWORD_HASH)) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const token = signToken({ id: user.ID, username: user.USERNAME, role: user.ROLE });

  const response = NextResponse.json({ success: true, role: user.ROLE });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === "true",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 7,
  });
  return response;
}
