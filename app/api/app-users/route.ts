import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface Row {
  [key: string]: unknown;
  ID:                  number;
  TELEGRAM_CHAT_ID:    number;
  TELEGRAM_USERNAME:   string | null;
  TELEGRAM_FIRST_NAME: string | null;
  TELEGRAM_LAST_NAME:  string | null;
  LANGUAGE_CODE:       string | null;
  STATUS:              string;
  CUSTOMER_ID:         number | null;
  CUSTOMER_NAME:       string | null;
  FIRST_SEEN:          Date | string | null;
  LAST_SEEN:           Date | string | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const url    = new URL(request.url);
  const status = url.searchParams.get("status"); // 'pending' | 'linked' | 'blocked' | null

  const where  = status ? `WHERE au.STATUS = :1` : "";
  const binds  = status ? [status] : [];

  const rows = await query<Row>(
    `SELECT au.ID, au.TELEGRAM_CHAT_ID, au.TELEGRAM_USERNAME,
            au.TELEGRAM_FIRST_NAME, au.TELEGRAM_LAST_NAME, au.LANGUAGE_CODE,
            au.STATUS, au.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
            au.FIRST_SEEN, au.LAST_SEEN
       FROM APP_USERS au
       LEFT JOIN AGRO_CUSTOMERS c ON c.ID = au.CUSTOMER_ID
       ${where}
      ORDER BY au.LAST_SEEN DESC NULLS LAST`,
    binds
  );

  return NextResponse.json(rows.map((r) => ({
    id:                r.ID,
    telegram_chat_id:  Number(r.TELEGRAM_CHAT_ID),
    telegram_username: r.TELEGRAM_USERNAME,
    first_name:        r.TELEGRAM_FIRST_NAME,
    last_name:         r.TELEGRAM_LAST_NAME,
    language_code:     r.LANGUAGE_CODE,
    status:            r.STATUS,
    customer_id:       r.CUSTOMER_ID,
    customer_name:     r.CUSTOMER_NAME,
    first_seen:        iso(r.FIRST_SEEN),
    last_seen:         iso(r.LAST_SEEN),
  })));
}
