import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { hashPassword } from "@/lib/auth";

interface UserRow extends Record<string, unknown> {
  ID: number;
  EMAIL: string;
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  ROLE: string;
  CREATED_AT: string;
}

export async function GET() {
  const conn = await (await import("@/lib/oracle")).getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, email, first_name, last_name, role, created_at
       FROM crm_user.users ORDER BY created_at DESC`,
      [],
      { outFormat: 4002 }
    );
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    return NextResponse.json(rows.map((r) => ({
      id:         Number(r["ID"]),
      email:      r["EMAIL"],
      first_name: r["FIRST_NAME"] ?? null,
      last_name:  r["LAST_NAME"] ?? null,
      role:       r["ROLE"],
      created_at: r["CREATED_AT"] instanceof Date
        ? (r["CREATED_AT"] as Date).toISOString()
        : String(r["CREATED_AT"] ?? ""),
    })));
  } finally {
    await conn.close();
  }
}

export async function POST(request: Request) {
  const { email, password, first_name, last_name, role } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
  }

  // Проверяем существует ли пользователь
  const existing = await query<UserRow>(
    `SELECT id FROM crm_user.users WHERE email = :1`, [email]
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: "Пользователь уже существует" }, { status: 400 });
  }

  const passwordHash = hashPassword(password);
  await execute(
    `INSERT INTO crm_user.users (email, password_hash, first_name, last_name, role)
     VALUES (:1, :2, :3, :4, :5)`,
    [email, passwordHash, first_name || null, last_name || null, role ?? "user"]
  );

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const { id, first_name, last_name, role } = await request.json();
  await execute(
    `UPDATE crm_user.users SET first_name = :1, last_name = :2, role = :3 WHERE id = :4`,
    [first_name || null, last_name || null, role, id]
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  await execute(`DELETE FROM crm_user.users WHERE id = :1`, [id]);
  return NextResponse.json({ success: true });
}