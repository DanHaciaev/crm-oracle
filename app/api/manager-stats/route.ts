import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface StatsRow {
  [key: string]: unknown;
  ID: number; USERNAME: string;
  FIRST_NAME: string | null; LAST_NAME: string | null; ROLE: string;
  TOTAL_TASKS: number; OPEN_TASKS: number; DONE_TASKS: number; OVERDUE_TASKS: number;
  TOTAL_ACTS: number; ACTS_7D: number; ACTS_30D: number;
  CALLS: number; MEETINGS: number; NOTES: number;
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<StatsRow>(`
    SELECT
      u.ID, u.USERNAME, u.FIRST_NAME, u.LAST_NAME, u.ROLE,
      NVL(t.TOTAL_TASKS,   0) AS TOTAL_TASKS,
      NVL(t.OPEN_TASKS,    0) AS OPEN_TASKS,
      NVL(t.DONE_TASKS,    0) AS DONE_TASKS,
      NVL(t.OVERDUE_TASKS, 0) AS OVERDUE_TASKS,
      NVL(a.TOTAL_ACTS,    0) AS TOTAL_ACTS,
      NVL(a.ACTS_7D,       0) AS ACTS_7D,
      NVL(a.ACTS_30D,      0) AS ACTS_30D,
      NVL(a.CALLS,         0) AS CALLS,
      NVL(a.MEETINGS,      0) AS MEETINGS,
      NVL(a.NOTES,         0) AS NOTES
    FROM AGRO_USERS u
    LEFT JOIN (
      SELECT
        ASSIGNED_TO,
        COUNT(*)                                                                          AS TOTAL_TASKS,
        SUM(CASE WHEN STATUS IN ('open','in_progress') THEN 1 ELSE 0 END)                AS OPEN_TASKS,
        SUM(CASE WHEN STATUS = 'done' THEN 1 ELSE 0 END)                                 AS DONE_TASKS,
        SUM(CASE WHEN STATUS IN ('open','in_progress')
                  AND DUE_DATE IS NOT NULL AND DUE_DATE < SYSDATE THEN 1 ELSE 0 END)     AS OVERDUE_TASKS
      FROM AGRO_CRM_TASKS
      WHERE ASSIGNED_TO IS NOT NULL
      GROUP BY ASSIGNED_TO
    ) t ON u.USERNAME = t.ASSIGNED_TO
    LEFT JOIN (
      SELECT
        CREATED_BY,
        COUNT(*)                                                               AS TOTAL_ACTS,
        SUM(CASE WHEN CREATED_AT >= SYSDATE - 7  THEN 1 ELSE 0 END)          AS ACTS_7D,
        SUM(CASE WHEN CREATED_AT >= SYSDATE - 30 THEN 1 ELSE 0 END)          AS ACTS_30D,
        SUM(CASE WHEN ACT_TYPE = 'call'    THEN 1 ELSE 0 END)                 AS CALLS,
        SUM(CASE WHEN ACT_TYPE = 'meeting' THEN 1 ELSE 0 END)                 AS MEETINGS,
        SUM(CASE WHEN ACT_TYPE = 'note'    THEN 1 ELSE 0 END)                 AS NOTES
      FROM AGRO_CRM_ACTIVITIES
      WHERE CREATED_BY IS NOT NULL
      GROUP BY CREATED_BY
    ) a ON u.USERNAME = a.CREATED_BY
    WHERE u.ACTIVE = 'Y'
    ORDER BY u.ROLE, u.USERNAME
  `, []);

  return NextResponse.json(rows.map((r) => ({
    id:            Number(r.ID),
    username:      String(r.USERNAME),
    first_name:    r.FIRST_NAME ? String(r.FIRST_NAME) : null,
    last_name:     r.LAST_NAME  ? String(r.LAST_NAME)  : null,
    role:          String(r.ROLE),
    total_tasks:   Number(r.TOTAL_TASKS),
    open_tasks:    Number(r.OPEN_TASKS),
    done_tasks:    Number(r.DONE_TASKS),
    overdue_tasks: Number(r.OVERDUE_TASKS),
    total_acts:    Number(r.TOTAL_ACTS),
    acts_7d:       Number(r.ACTS_7D),
    acts_30d:      Number(r.ACTS_30D),
    calls:         Number(r.CALLS),
    meetings:      Number(r.MEETINGS),
    notes:         Number(r.NOTES),
  })));
}
