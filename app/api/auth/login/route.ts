import { NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { comparePassword, signToken } from "@/lib/auth";

interface UserRow extends Record<string, unknown> {
  ID: number;
  EMAIL: string;
  PASSWORD_HASH: string;
  ROLE: string;
}

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const users = await query<UserRow>(
    `SELECT id, email, password_hash, role FROM crm_user.users WHERE email = :1`,
    [email]
  );

  if (users.length === 0) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const user = users[0];
  const valid = comparePassword(password, user.PASSWORD_HASH);

  if (!valid) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const token = signToken({
    id:    String(user.ID),
    email: user.EMAIL,
    role:  user.ROLE,
  });

  const response = NextResponse.json({ success: true, role: user.ROLE });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 7,
  });

  return response;
}