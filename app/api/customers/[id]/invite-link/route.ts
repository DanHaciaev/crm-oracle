import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { execute, query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as { ttl_days?: number }));
  const ttlDays = Number.isFinite(body.ttl_days) && body.ttl_days! > 0 ? body.ttl_days! : 7;

  // Verify customer exists
  const customers = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]
  );
  if (customers.length === 0) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const inviteToken = randomBytes(24).toString("hex");
  const botUsername = process.env.TG_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json({ error: "TG_BOT_USERNAME не задан на сервере" }, { status: 500 });
  }

  await execute(
    `INSERT INTO CRM_TG_BINDINGS
       (CUSTOMER_ID, INVITE_TOKEN, CREATED_BY, EXPIRES_AT)
     VALUES
       (:1, :2, :3, SYSTIMESTAMP + NUMTODSINTERVAL(:4, 'DAY'))`,
    [customerId, inviteToken, auth.id, ttlDays]
  );

  const url = `https://t.me/${botUsername}?start=${inviteToken}`;

  return NextResponse.json({
    invite_token: inviteToken,
    url,
    ttl_days:     ttlDays,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as { binding_id?: number }));
  if (!body.binding_id) {
    return NextResponse.json({ error: "binding_id обязателен" }, { status: 400 });
  }

  await execute(
    `UPDATE CRM_TG_BINDINGS
        SET STATUS = 'revoked'
      WHERE ID = :1 AND CUSTOMER_ID = :2 AND STATUS = 'pending'`,
    [body.binding_id, customerId]
  );

  return NextResponse.json({ success: true });
}
