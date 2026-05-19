import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: unknown) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [tasks, messages, automations] = await Promise.all([

    query<{ ID: number; TITLE: string; CUSTOMER_NAME: string | null; DUE_DATE: unknown; PRIORITY: string }>(`
      SELECT * FROM (
        SELECT t.ID, t.TITLE, c.NAME AS CUSTOMER_NAME, t.DUE_DATE, t.PRIORITY
        FROM AGRO_CRM_TASKS t
        LEFT JOIN AGRO_CUSTOMERS c ON c.ID = t.CUSTOMER_ID
        WHERE t.STATUS IN ('open','in_progress')
          AND t.DUE_DATE IS NOT NULL
          AND t.DUE_DATE < SYSDATE
        ORDER BY t.DUE_DATE ASC
      ) WHERE ROWNUM <= 10
    `, []),

    query<{ APP_USER_ID: number; CUSTOMER_ID: number | null; CUSTOMER_NAME: string | null; UNREAD_COUNT: number }>(`
      SELECT * FROM (
        SELECT au.ID AS APP_USER_ID, au.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
               au.UNREAD_COUNT
        FROM AGRO_CRM_APP_USERS au
        LEFT JOIN AGRO_CUSTOMERS c ON c.ID = au.CUSTOMER_ID
        WHERE au.UNREAD_COUNT > 0
        ORDER BY au.LAST_MESSAGE_AT DESC NULLS LAST
      ) WHERE ROWNUM <= 10
    `, []),

    query<{ ID: number; RULE_NAME: string; CUSTOMER_NAME: string | null; RESULT: string; FIRED_AT: unknown }>(`
      SELECT * FROM (
        SELECT l.ID, r.NAME AS RULE_NAME, c.NAME AS CUSTOMER_NAME,
               l.RESULT, l.FIRED_AT
        FROM AGRO_CRM_AUTOMATION_LOG l
        JOIN AGRO_CRM_AUTOMATION_RULES r ON r.ID = l.RULE_ID
        JOIN AGRO_CUSTOMERS c             ON c.ID = l.CUSTOMER_ID
        WHERE l.FIRED_AT > SYSDATE - 1
          AND l.RESULT = 'success'
        ORDER BY l.FIRED_AT DESC
      ) WHERE ROWNUM <= 5
    `, []),

  ]);

  const overdue_tasks = tasks.map((r) => ({
    id:            Number(r.ID),
    title:         String(r.TITLE),
    customer_name: r.CUSTOMER_NAME ? String(r.CUSTOMER_NAME) : null,
    due_date:      iso(r.DUE_DATE),
    priority:      String(r.PRIORITY),
  }));

  const unread_messages = messages.map((r) => ({
    app_user_id:   Number(r.APP_USER_ID),
    customer_id:   r.CUSTOMER_ID ? Number(r.CUSTOMER_ID) : null,
    customer_name: r.CUSTOMER_NAME ? String(r.CUSTOMER_NAME) : null,
    count:         Number(r.UNREAD_COUNT),
  }));

  const recent_automations = automations.map((r) => ({
    id:            Number(r.ID),
    rule_name:     String(r.RULE_NAME),
    customer_name: r.CUSTOMER_NAME ? String(r.CUSTOMER_NAME) : null,
    result:        String(r.RESULT),
    fired_at:      iso(r.FIRED_AT),
  }));

  const total =
    overdue_tasks.length +
    unread_messages.reduce((s, m) => s + m.count, 0) +
    recent_automations.length;

  return NextResponse.json(
    { total, overdue_tasks, unread_messages, recent_automations },
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=10" } }
  );
}
