import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";


interface StaleLeadRow {
  [key: string]: unknown;
  ID:           number;
  NAME:         string;
  STATUS:       string;
  DAYS_IDLE:    number;
  MANAGER_NAME: string | null;
}

// Leads idle too long ("new"/"contacted" > 3 days, other open stages > 7):
// one follow-up task per lead for its manager + a Telegram summary to the
// admin chat. Rewritten against the real AGRO_CRM_LEADS / AGRO_CRM_TASKS
// columns — the old version used STAGE / RESPONSIBLE_ID / LEAD_ID /
// TG_CHAT_ID, which don't exist, so it failed on every run.
export async function GET() {
  // UPDATED_AT/CREATED_AT are TIMESTAMPs: cast to DATE so the difference is
  // a number of days, not an INTERVAL.
  const rows = await query<StaleLeadRow>(`
    SELECT l.ID, l.NAME, l.STATUS,
           ROUND(SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE)) AS DAYS_IDLE,
           l.ASSIGNED_TO AS MANAGER_NAME
    FROM AGRO_CRM_LEADS l
    WHERE l.STATUS NOT IN ('won', 'lost')
      AND (
        (l.STATUS IN ('new', 'contacted') AND SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE) > 3)
        OR
        (l.STATUS NOT IN ('new', 'contacted') AND SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE) > 7)
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

    // AGRO_CRM_TASKS has no LEAD_ID — the lead is tagged in the title, which
    // is also what keeps a re-run from creating a duplicate open task.
    const tag = `(лид #${row.ID})`;
    const open = await query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM AGRO_CRM_TASKS
        WHERE STATUS IN ('open','in_progress') AND INSTR(TITLE, :tag) > 0`, { tag });
    if (Number(open[0]?.N ?? 0) > 0) continue;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    await execute(
      `INSERT INTO AGRO_CRM_TASKS (TITLE, STATUS, PRIORITY, ASSIGNED_TO, DUE_DATE, NOTES, CREATED_BY, CREATED_AT)
       VALUES (:title, 'open', 'high', :assignee, :due, :notes, 'system', SYSTIMESTAMP)`,
      {
        title:    `Нет активности по лиду «${row.NAME}» ${tag}`.slice(0, 200),
        assignee: row.MANAGER_NAME,
        due:      dueDate,
        notes:    `${row.DAYS_IDLE} дн. без активности, статус: ${row.STATUS}`,
      }
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
        lines.push(`  • ${l.NAME} [${l.STATUS}] — ${l.DAYS_IDLE} дн. без активности`);
    }
    await sendText(adminChatId, lines.join("\n"));
  }

  return NextResponse.json({ created: tasksCreated, leads: rows.length });
}
