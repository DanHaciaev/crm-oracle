import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface CustomerRow {
  [key: string]: unknown;
  ID:                 number;
  CODE:               string;
  NAME:               string;
  COUNTRY:            string | null;
  CUSTOMER_TYPE:      string | null;
  CONTACT_PHONE:      string | null;
  CONTACT_EMAIL:      string | null;
  ACTIVE:             string;
  APP_USER_ID:        number | null;
  TG_USERNAME:        string | null;
  TG_CHAT_ID:         number | null;
  PENDING_INVITES:    number;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const rows = await query<CustomerRow>(`
    SELECT
      c.ID, c.CODE, c.NAME, c.COUNTRY, c.CUSTOMER_TYPE,
      c.CONTACT_PHONE, c.CONTACT_EMAIL, c.ACTIVE,
      au.ID                AS APP_USER_ID,
      au.TELEGRAM_USERNAME AS TG_USERNAME,
      au.TELEGRAM_CHAT_ID  AS TG_CHAT_ID,
      (SELECT COUNT(*) FROM CRM_TG_BINDINGS b
        WHERE b.CUSTOMER_ID = c.ID AND b.STATUS = 'pending') AS PENDING_INVITES
    FROM AGRO_CUSTOMERS c
    LEFT JOIN APP_USERS au
      ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'
    ORDER BY c.NAME
  `);

  return NextResponse.json(rows.map((r) => ({
    id:               r.ID,
    code:             r.CODE,
    name:             r.NAME,
    country:          r.COUNTRY,
    customer_type:    r.CUSTOMER_TYPE,
    contact_phone:    r.CONTACT_PHONE,
    contact_email:    r.CONTACT_EMAIL,
    active:           r.ACTIVE === "Y",
    tg_linked:        r.APP_USER_ID !== null,
    tg_username:      r.TG_USERNAME,
    tg_chat_id:       r.TG_CHAT_ID,
    pending_invites:  Number(r.PENDING_INVITES ?? 0),
  })));
}

/**
 * POST /api/customers — создать клиента (и опционально сразу привязать к APP_USER).
 * Body: { code?, name, country?, contact_phone?, contact_email?, customer_type?, address?, tax_id?, link_app_user_id? }
 * Если CODE не передан — сгенерируется автоматически (CUST-<timestamp>).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name: string  = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });

  const customerType = body.customer_type === "export" ? "export" : "domestic";
  let code: string = String(body.code ?? "").trim();
  if (!code) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    code = `CUST-${stamp}`;
  }

  const dup = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CUSTOMERS WHERE CODE = :1`, [code]
  );
  if (dup.length > 0) {
    return NextResponse.json({ error: `Код "${code}" уже используется` }, { status: 400 });
  }

  await execute(
    `INSERT INTO AGRO_CUSTOMERS
       (CODE, NAME, COUNTRY, TAX_ID, CONTACT_PHONE, CONTACT_EMAIL, ADDRESS, CUSTOMER_TYPE)
     VALUES (:1, :2, :3, :4, :5, :6, :7, :8)`,
    [
      code,
      name,
      body.country       || null,
      body.tax_id        || null,
      body.contact_phone || null,
      body.contact_email || null,
      body.address       || null,
      customerType,
    ]
  );

  const created = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CUSTOMERS WHERE CODE = :1`, [code]
  );
  const customerId = created[0]?.ID;

  // Опциональная авто-привязка к APP_USER
  const linkAppUserId = Number(body.link_app_user_id);
  if (Number.isFinite(linkAppUserId) && linkAppUserId > 0 && customerId) {
    await execute(
      `UPDATE APP_USERS SET CUSTOMER_ID = :1, STATUS = 'linked' WHERE ID = :2`,
      [customerId, linkAppUserId]
    );
    await execute(
      `INSERT INTO CRM_APP_USER_EVENTS (APP_USER_ID, EVENT_TYPE, PAYLOAD, ACTOR_USER)
       VALUES (:1, 'linked', :2, :3)`,
      [linkAppUserId, `customer_id=${customerId} (created from chat)`, auth.id]
    );
  }

  return NextResponse.json({ id: customerId, code, name });
}
