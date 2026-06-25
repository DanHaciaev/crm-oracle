import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

interface EscalationRow {
  [key: string]: unknown;
  ID:            number;
  NAME:          string;
  STAGE:         string;
  HOURS_SINCE:   number;
  MANAGER_NAME:  string | null;
  MANAGER_CHAT:  number | null;
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Leads in 'new' stage for more than 2 hours with no escalation task yet
  const rows = await query<EscalationRow>(`
    SELECT l.ID, l.NAME, l.STAGE,
           ROUND((SYSDATE - l.CREATED_AT) * 24, 1) AS HOURS_SINCE,
           au.USERNAME  AS MANAGER_NAME,
           au.TG_CHAT_ID AS MANAGER_CHAT
    FROM AGRO_CRM_LEADS l
    LEFT JOIN AGRO_USERS au ON au.ID = l.RESPONSIBLE_ID
    WHERE l.STAGE = 'new'
      AND SYSDATE - l.CREATED_AT > 2/24
      AND NOT EXISTS (
        SELECT 1 FROM AGRO_CRM_TASKS t
        WHERE t.LEAD_ID = l.ID
          AND t.TITLE LIKE '%SLA%'
          AND t.CREATED_AT > SYSDATE - 1
      )
    ORDER BY HOURS_SINCE DESC
  `);

  if (rows.length === 0)
    return NextResponse.json({ escalated: 0, reason: "No SLA breaches" });

  for (const row of rows) {
    await execute(
      `INSERT INTO AGRO_CRM_TASKS (TITLE, STATUS, PRIORITY, LEAD_ID, CREATED_AT, UPDATED_AT)
       VALUES (:1, 'open', 'high', :2, SYSDATE, SYSDATE)`,
      [`⚡ SLA: лид «${row.NAME}» не обработан ${row.HOURS_SINCE} ч.`, row.ID]
    );

    if (row.MANAGER_CHAT) {
      await sendText(
        row.MANAGER_CHAT,
        `⚡ SLA нарушен: лид «${row.NAME}» ждёт ${row.HOURS_SINCE} ч. без ответа. Свяжитесь срочно!`
      ).catch(() => null);
    }
  }

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (adminChatId) {
    const lines = [`⚡ SLA нарушения (${rows.length}):`];
    for (const r of rows) {
      const mgr = r.MANAGER_NAME ? ` → ${r.MANAGER_NAME}` : "";
      lines.push(`  • «${r.NAME}» — ${r.HOURS_SINCE} ч. без ответа${mgr}`);
    }
    await sendText(adminChatId, lines.join("\n"));
  }

  return NextResponse.json({ escalated: rows.length });
}
