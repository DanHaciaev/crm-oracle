import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
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
       FROM APP_USERS
      WHERE CUSTOMER_ID = :1 AND STATUS = 'linked'`,
    [customerId]
  );

  const bindings = await query<BindingRow>(
    `SELECT ID, INVITE_TOKEN, STATUS, CREATED_AT, EXPIRES_AT, BOUND_AT
       FROM CRM_TG_BINDINGS
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
    app_users: appUsers.map((u) => ({
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
