import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface CustomerRow {
  [key: string]: unknown;
  ID:            number;
  CODE:          string;
  NAME:          string;
  COUNTRY:       string | null;
  TAX_ID:        string | null;
  CONTACT_PHONE: string | null;
  CONTACT_EMAIL: string | null;
  ADDRESS:       string | null;
  CUSTOMER_TYPE: string | null;
  ACTIVE:        string;
  CREATED_AT:    string | Date | null;
}

interface AppUserRow {
  [key: string]: unknown;
  ID:                 number;
  TELEGRAM_CHAT_ID:   number;
  TELEGRAM_USERNAME:  string | null;
  TELEGRAM_FIRST_NAME:string | null;
  TELEGRAM_LAST_NAME: string | null;
  STATUS:             string;
  FIRST_SEEN:         string | Date | null;
  LAST_SEEN:          string | Date | null;
}

interface BindingRow {
  [key: string]: unknown;
  ID:           number;
  INVITE_TOKEN: string;
  STATUS:       string;
  CREATED_AT:   string | Date | null;
  EXPIRES_AT:   string | Date | null;
  BOUND_AT:     string | Date | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: string | Date | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const customers = await query<CustomerRow>(
    `SELECT ID, CODE, NAME, COUNTRY, TAX_ID, CONTACT_PHONE, CONTACT_EMAIL,
            ADDRESS, CUSTOMER_TYPE, ACTIVE, CREATED_AT
       FROM AGRO_CUSTOMERS WHERE ID = :1`,
    [customerId]
  );
  if (customers.length === 0) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }
  const c = customers[0];

  const appUsers = await query<AppUserRow>(
    `SELECT ID, TELEGRAM_CHAT_ID, TELEGRAM_USERNAME, TELEGRAM_FIRST_NAME,
            TELEGRAM_LAST_NAME, STATUS, FIRST_SEEN, LAST_SEEN
       FROM AGRO_CRM_APP_USERS
      WHERE CUSTOMER_ID = :1 AND STATUS = 'linked'`,
    [customerId]
  );

  const bindings = await query<BindingRow>(
    `SELECT ID, INVITE_TOKEN, STATUS, CREATED_AT, EXPIRES_AT, BOUND_AT
       FROM AGRO_CRM_TG_BINDINGS
      WHERE CUSTOMER_ID = :1
      ORDER BY CREATED_AT DESC`,
    [customerId]
  );

  return NextResponse.json({
    id:             c.ID,
    code:           c.CODE,
    name:           c.NAME,
    country:        c.COUNTRY,
    tax_id:         c.TAX_ID,
    contact_phone:  c.CONTACT_PHONE,
    contact_email:  c.CONTACT_EMAIL,
    address:        c.ADDRESS,
    customer_type:  c.CUSTOMER_TYPE,
    active:         c.ACTIVE === "Y",
    created_at:     iso(c.CREATED_AT),
    AGRO_CRM_APP_USERS: appUsers.map((u) => ({
      id:               u.ID,
      telegram_chat_id: u.TELEGRAM_CHAT_ID,
      telegram_username:u.TELEGRAM_USERNAME,
      first_name:       u.TELEGRAM_FIRST_NAME,
      last_name:        u.TELEGRAM_LAST_NAME,
      status:           u.STATUS,
      first_seen:       iso(u.FIRST_SEEN),
      last_seen:        iso(u.LAST_SEEN),
    })),
    bindings: bindings.map((b) => ({
      id:           b.ID,
      invite_token: b.INVITE_TOKEN,
      status:       b.STATUS,
      created_at:   iso(b.CREATED_AT),
      expires_at:   iso(b.EXPIRES_AT),
      bound_at:     iso(b.BOUND_AT),
    })),
  });
}

/**
 * DELETE /api/customers/[id]
 *   - Чистит CRM-связи: AGRO_CRM_APP_USERS.CUSTOMER_ID → NULL (status='pending'),
 *     AGRO_CRM_TG_BINDINGS — удаляются.
 *   - DELETE из AGRO_CUSTOMERS.
 *   - Если есть документы в AGRO (закупки/продажи/акты) с FK на этого клиента —
 *     Oracle вернёт ORA-02292; в этом случае возвращаем 409 с понятным сообщением.
 *
 * ?soft=1 — мягкое удаление: только ACTIVE='N', записи не трогаем. Безопасный
 * вариант для клиентов, у которых уже есть документы в AGRO.
 */
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

  const exists = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]
  );
  if (exists.length === 0) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const url  = new URL(request.url);
  const soft = url.searchParams.get("soft") === "1";

  if (soft) {
    await execute(`UPDATE AGRO_CUSTOMERS SET ACTIVE = 'N' WHERE ID = :1`, [customerId]);
    return NextResponse.json({ success: true, deactivated: true });
  }

  // Hard delete: сначала вычищаем CRM-внутренние ссылки.
  await execute(
    `UPDATE AGRO_CRM_APP_USERS
        SET CUSTOMER_ID = NULL, STATUS = 'pending'
      WHERE CUSTOMER_ID = :1`,
    [customerId]
  );
  await execute(
    `DELETE FROM AGRO_CRM_TG_BINDINGS WHERE CUSTOMER_ID = :1`,
    [customerId]
  );

  try {
    await execute(`DELETE FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ORA-02292")) {
      return NextResponse.json({
        error: "Нельзя удалить — у клиента есть документы в AGRO (закупки, продажи, акты, партии). Используйте деактивацию.",
        code:  "HAS_DEPENDENCIES",
      }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ success: true, deactivated: false });
}
