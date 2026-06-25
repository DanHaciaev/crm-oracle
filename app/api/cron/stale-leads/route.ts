import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

interface StaleLeadRow {
  [key: string]: unknown;
  ID:           number;
  NAME:         string;
  STAGE:        string;
  DAYS_IDLE:    number;
  MANAGER_NAME: string | null;
  MANAGER_ID:   number | null;
  CHAT_ID:      number | null;
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await query<StaleLeadRow>(`
    SELECT l.ID, l.NAME, l.STAGE,
           ROUND(SYSDATE - l.UPDATED_AT) AS DAYS_IDLE,
           au.USERNAME AS MANAGER_NAME,
           au.ID       AS MANAGER_ID,
           au.TG_CHAT_ID AS CHAT_ID
    FROM AGRO_CRM_LEADS l
    LEFT JOIN AGRO_USERS au ON au.ID = l.RESPONSIBLE_ID
    WHERE l.STAGE NOT IN ('won', 'lost')
      AND (
        (l.STAGE IN ('new', 'contacted') AND SYSDATE - l.UPDATED_AT > 3)
        OR
        (l.STAGE NOT IN ('new', 'contacted') AND SYSDATE - l.UPDATED_AT > 7)
      )
    ORDER BY DAYS_IDLE DESC, l.NAME
  `);

  if (rows.length === 0)
    return NextResponse.json({ created: 0, reason: "No stale leads" });

  let tasksCreated = 0;
  const byManager = new Map<string, StaleLeadRow[]>();

  for (const row of rows) {
    const key = row.MANAGER_NAME ?? "Без ответственного";
    if (!byManager.has(key)) byManager.set(key, []);
    byManager.get(key)!.push(row);

    const title = `Нет активности по лиду «${row.NAME}» (${row.DAYS_IDLE} дн.)`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    await execute(
      `INSERT INTO AGRO_CRM_TASKS (TITLE, STATUS, PRIORITY, ASSIGNED_TO, DUE_DATE, LEAD_ID, CREATED_AT, UPDATED_AT)
       SELECT :1, 'open', 'high', :2, :3, :4, SYSDATE, SYSDATE FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM AGRO_CRM_TASKS
         WHERE LEAD_ID = :5 AND STATUS IN ('open','in_progress')
           AND TITLE LIKE '%активности по лиду%' AND CREATED_AT > SYSDATE - 3
       )`,
      [title, row.MANAGER_NAME, dueDate, row.ID, row.ID]
    );
    tasksCreated++;
  }

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (adminChatId) {
    const lines: string[] = [`🥱 Зависшие лиды (${rows.length}):`];
    for (const [manager, leads] of byManager) {
      lines.push(`\n👤 ${manager} (${leads.length}):`);
      for (const l of leads)
        lines.push(`  • ${l.NAME} [${l.STAGE}] — ${l.DAYS_IDLE} дн. без активности`);
    }
    await sendText(adminChatId, lines.join("\n"));
  }

  for (const row of rows) {
    if (!row.CHAT_ID) continue;
    const msg = `🥱 Лид «${row.NAME}» без активности ${row.DAYS_IDLE} дн. Создана задача — не забудьте связаться!`;
    await sendText(row.CHAT_ID, msg).catch(() => null);
  }

  return NextResponse.json({ created: tasksCreated, leads: rows.length });
}
