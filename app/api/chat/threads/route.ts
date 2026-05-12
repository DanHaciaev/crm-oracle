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
  STATUS:              string;
  CUSTOMER_ID:         number | null;
  CUSTOMER_NAME:       string | null;
  LAST_MESSAGE_AT:     Date | string | null;
  UNREAD_COUNT:        number;
  LAST_BODY:           string | null;
  LAST_DIR:            string | null;
  LAST_FILE_TYPE:      string | null;
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

  const url      = new URL(request.url);
  const archived = url.searchParams.get("archived") === "1";

  // Берём последнее сообщение per APP_USER через CTE + ROW_NUMBER().
  // Это работает в 11g и обходит ограничение Oracle на многоуровневую корреляцию
  // (au.ID не разрешён внутри вложенного subquery в SELECT-листе).
  const rows = await query<Row>(`
    WITH LAST_MSG AS (
      SELECT APP_USER_ID, BODY, DIRECTION, FILE_TYPE,
             ROW_NUMBER() OVER (PARTITION BY APP_USER_ID ORDER BY CREATED_AT DESC, ID DESC) AS RN
        FROM AGRO_CRM_CHAT_MESSAGES
    )
    SELECT
      au.ID,
      au.TELEGRAM_CHAT_ID,
      au.TELEGRAM_USERNAME,
      au.TELEGRAM_FIRST_NAME,
      au.TELEGRAM_LAST_NAME,
      au.STATUS,
      au.CUSTOMER_ID,
      c.NAME       AS CUSTOMER_NAME,
      au.LAST_MESSAGE_AT,
      au.UNREAD_COUNT,
      lm.BODY      AS LAST_BODY,
      lm.DIRECTION AS LAST_DIR,
      lm.FILE_TYPE AS LAST_FILE_TYPE
    FROM AGRO_CRM_APP_USERS au
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = au.CUSTOMER_ID
    LEFT JOIN LAST_MSG       lm ON lm.APP_USER_ID = au.ID AND lm.RN = 1
    WHERE au.ARCHIVED = :1
    ORDER BY au.LAST_MESSAGE_AT DESC NULLS LAST, au.LAST_SEEN DESC NULLS LAST
  `, [archived ? "Y" : "N"]);

  return NextResponse.json(rows.map((r) => ({
    id:                r.ID,
    telegram_chat_id:  Number(r.TELEGRAM_CHAT_ID),
    telegram_username: r.TELEGRAM_USERNAME,
    first_name:        r.TELEGRAM_FIRST_NAME,
    last_name:         r.TELEGRAM_LAST_NAME,
    status:            r.STATUS,
    customer_id:       r.CUSTOMER_ID,
    customer_name:     r.CUSTOMER_NAME,
    last_message_at:   iso(r.LAST_MESSAGE_AT),
    unread_count:      Number(r.UNREAD_COUNT ?? 0),
    last_body:         r.LAST_BODY ? String(r.LAST_BODY).slice(0, 200) : null,
    last_dir:          r.LAST_DIR,
    last_file_type:    r.LAST_FILE_TYPE,
  })));
}
