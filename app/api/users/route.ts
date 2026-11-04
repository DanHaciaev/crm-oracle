import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { hashPassword, verifyToken } from "@/lib/auth";
import { isRole } from "@/lib/permissions";
import { invalidatePermissions, userAccess } from "@/lib/permissions-server";

interface UserRow {
  [key: string]: unknown; 
  ID: number;
  USERNAME: string;
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  ROLE: string;
  ACTIVE: string;
  CREATED_AT: string | Date;
  TWO_FACTOR: string;
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return { ok: false as const, status: 401, error: "Не авторизован" };
  const me = await userAccess(payload.id);
  if (!me?.active || me.role !== "admin") return { ok: false as const, status: 403, error: "Доступ только для администраторов" };
  return { ok: true as const, payload };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await query<UserRow>(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.role, u.active, u.created_at,
            NVL(t.ENABLED, 'N') AS TWO_FACTOR
       FROM AGRO_USERS u
       LEFT JOIN AGRO_CRM_USER_2FA t ON t.USER_ID = u.id
      ORDER BY u.created_at DESC`
  );

  return NextResponse.json(rows.map((u) => ({
    id: u.ID,
    username: u.USERNAME,
    first_name: u.FIRST_NAME,
    last_name: u.LAST_NAME,
    role: u.ROLE,
    active: u.ACTIVE === "Y",
    two_factor: u.TWO_FACTOR === "Y",
    created_at: u.CREATED_AT instanceof Date ? u.CREATED_AT.toISOString() : String(u.CREATED_AT ?? ""),
  })));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { username, password, first_name, last_name, role } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Логин и пароль обязательны" }, { status: 400 });
  }
  if (role && !isRole(role)) {
    return NextResponse.json({ error: "Роль должна быть admin, manager, operator или viewer" }, { status: 400 });
  }

  const existing = await query<{ ID: number }>(
    `SELECT id FROM AGRO_USERS WHERE username = :1`, [username]
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: "Пользователь с таким логином уже существует" }, { status: 400 });
  }

  await execute(
    `INSERT INTO AGRO_USERS (username, password_hash, first_name, last_name, role)
     VALUES (:1, :2, :3, :4, :5)`,
    [username, hashPassword(password), first_name || null, last_name || null, role ?? "manager"]
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  if (Number(id) === auth.payload.id) {
    return NextResponse.json({ error: "Нельзя удалить самого себя" }, { status: 400 });
  }

  await execute(`DELETE FROM AGRO_USERS WHERE id = :1`, [id]);
  invalidatePermissions();
  return NextResponse.json({ success: true });
}


export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, first_name, last_name, role, password } = await request.json();

  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  if (role && !isRole(role)) {
    return NextResponse.json({ error: "Роль должна быть admin, manager, operator или viewer" }, { status: 400 });
  }

  if (password) {
    await execute(
      `UPDATE AGRO_USERS
          SET first_name     = :1,
              last_name      = :2,
              role           = :3,
              password_hash  = :4
        WHERE id = :5`,
      [first_name || null, last_name || null, role, hashPassword(password), id]
    );
  } else {
    await execute(
      `UPDATE AGRO_USERS
          SET first_name = :1,
              last_name  = :2,
              role       = :3
        WHERE id = :4`,
      [first_name || null, last_name || null, role, id]
    );
  }

  invalidatePermissions();
  return NextResponse.json({ success: true });
}