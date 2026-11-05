import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute, getConnection } from "@/lib/oracle";
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const existing = await query<CustomerRow>(
    `SELECT ID, NAME, COUNTRY, TAX_ID, CONTACT_PHONE, CONTACT_EMAIL,
            ADDRESS, CUSTOMER_TYPE FROM AGRO_CUSTOMERS WHERE ID = :1`,
    [customerId]
  );
  if (!existing.length)
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  const old = existing[0];

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, country, tax_id, contact_phone, contact_email, address, customer_type } = body;

  await execute(`
    UPDATE AGRO_CUSTOMERS SET
      NAME          = :1,
      COUNTRY       = :2,
      TAX_ID        = :3,
      CONTACT_PHONE = :4,
      CONTACT_EMAIL = :5,
      ADDRESS       = :6,
      CUSTOMER_TYPE = :7
    WHERE ID = :8
  `, [
    name          !== undefined ? String(name)                         : old.NAME,
    country       !== undefined ? (country       ? String(country)       : null) : old.COUNTRY,
    tax_id        !== undefined ? (tax_id        ? String(tax_id)        : null) : old.TAX_ID,
    contact_phone !== undefined ? (contact_phone ? String(contact_phone) : null) : old.CONTACT_PHONE,
    contact_email !== undefined ? (contact_email ? String(contact_email) : null) : old.CONTACT_EMAIL,
    address       !== undefined ? (address       ? String(address)       : null) : old.ADDRESS,
    customer_type !== undefined ? (customer_type ? String(customer_type) : null) : old.CUSTOMER_TYPE,
    customerId,
  ]);

  await execute(`
    INSERT INTO AGRO_CRM_AUDIT_LOG
      (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
    VALUES ('customer', :1, :2, 'update', :3, :4, :5)
  `, [
    customerId,
    String(old.NAME),
    user.username,
    JSON.stringify({ name: old.NAME, country: old.COUNTRY, contact_phone: old.CONTACT_PHONE, contact_email: old.CONTACT_EMAIL }),
    JSON.stringify(body),
  ]);

  return NextResponse.json({ success: true });
}

// Records in DIPP FRUICT's own tables (and CRM payments, which are financial
// history) block a hard delete — such a customer can only be deactivated.
// The CRM never deletes DIPP FRUICT documents.
const BLOCKERS: { key: string; sql: string }[] = [
  { key: "sales",          sql: `SELECT COUNT(*) N FROM AGRO_SALES_DOCS WHERE CUSTOMER_ID = :id` },
  { key: "weight_tickets", sql: `SELECT COUNT(*) N FROM AGRO_WEIGHT_TICKETS WHERE CUSTOMER_ID = :id` },
  { key: "retail",         sql: `SELECT (SELECT COUNT(*) FROM AGRO_RETAIL_DOCS WHERE SELLER_ID = :id) + (SELECT COUNT(*) FROM AGRO_RETAIL_SESSIONS WHERE SELLER_ID = :id) N FROM DUAL` },
  { key: "invoices",       sql: `SELECT COUNT(*) N FROM AGRO_INVOICES WHERE CUSTOMER_ID = :id` },
  { key: "acceptance",     sql: `SELECT COUNT(*) N FROM AGRO_ACCEPTANCE_PROFILES WHERE CUSTOMER_ID = :id` },
  { key: "payments",       sql: `SELECT COUNT(*) N FROM AGRO_CRM_PAYMENTS WHERE CUSTOMER_ID = :id` },
];

// CRM-only data removed (or unlinked) together with the customer, in one
// transaction — children first.
const CRM_CLEANUP = [
  `DELETE FROM AGRO_CRM_CHAT_MESSAGES WHERE APP_USER_ID IN (SELECT ID FROM AGRO_CRM_APP_USERS WHERE CUSTOMER_ID = :id)`,
  `DELETE FROM AGRO_CRM_APP_USER_EVENTS WHERE APP_USER_ID IN (SELECT ID FROM AGRO_CRM_APP_USERS WHERE CUSTOMER_ID = :id)`,
  `DELETE FROM AGRO_CRM_TG_BINDINGS WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_APP_USERS WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_LOYALTY_TX WHERE MEMBER_ID IN (SELECT ID FROM AGRO_CRM_LOYALTY_MEMBERS WHERE CUSTOMER_ID = :id)`,
  `DELETE FROM AGRO_CRM_LOYALTY_MEMBERS WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_NPS WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_ACTIVITIES WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_AUTOMATION_LOG WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_ATTACHMENTS WHERE ENTITY_TYPE = 'customer' AND ENTITY_ID = :id`,
  `DELETE FROM AGRO_CRM_CUSTOMER_TERMS WHERE CUSTOMER_ID = :id`,
  `DELETE FROM AGRO_CRM_COMPLAINTS WHERE CUSTOMER_ID = :id`,
  `UPDATE AGRO_CRM_TASKS SET CUSTOMER_ID = NULL WHERE CUSTOMER_ID = :id`,
  `UPDATE AGRO_CRM_LEADS SET CUSTOMER_ID = NULL WHERE CUSTOMER_ID = :id`,
  `UPDATE AGRO_CRM_EMAILS SET CUSTOMER_ID = NULL WHERE CUSTOMER_ID = :id`,
];

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

  const exists = await query<{ ID: number; NAME: string }>(
    `SELECT ID, NAME FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]
  );
  if (exists.length === 0) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  // ── Мягкое удаление ──────────────────────────────────────────────────────
  if (new URL(request.url).searchParams.get("soft") === "1") {
    await execute(`UPDATE AGRO_CUSTOMERS SET ACTIVE = 'N' WHERE ID = :1`, [customerId]);
    return NextResponse.json({ success: true, mode: "deactivated" });
  }

  // ── Зависимости в DIPP FRUICT → только деактивация ───────────────────────
  const counts: Record<string, number> = {};
  for (const b of BLOCKERS) {
    const r = await query<{ N: number }>(b.sql, { id: customerId });
    const n = Number(r[0]?.N ?? 0);
    if (n > 0) counts[b.key] = n;
  }
  if (Object.keys(counts).length > 0) {
    return NextResponse.json({
      error: "У клиента есть документы в DIPP FRUICT или оплаты — его можно только деактивировать.",
      code:  "HAS_DEPENDENCIES",
      counts,
    }, { status: 409 });
  }

  // ── CRM-данные и сам клиент — одной транзакцией ──────────────────────────
  const conn = await getConnection();
  try {
    for (const sql of CRM_CLEANUP) await conn.execute(sql, { id: customerId });
    await conn.execute(`DELETE FROM AGRO_CUSTOMERS WHERE ID = :id`, { id: customerId });
    await conn.execute(
      `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY)
       VALUES ('customer', :id, :name, 'delete', :usr)`,
      { id: customerId, name: String(exists[0].NAME).slice(0, 200), usr: auth.username }
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error("[customers DELETE]", e);
    return NextResponse.json({ error: "Не удалось удалить клиента" }, { status: 500 });
  } finally {
    await conn.close();
  }

  return NextResponse.json({ success: true, mode: "deleted" });
}
