import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

interface TaskRow {
  [key: string]: unknown;
  TITLE: string;
  ASSIGNED_TO: string | null;
  CUSTOMER_NAME: string | null;
  DUE_DATE: Date | string | null;
}

function fmtDate(v: Date | string | null) {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU");
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (!adminChatId)
    return NextResponse.json({ skipped: true, reason: "TG_ADMIN_CHAT_ID not set" });

  const rows = await query<TaskRow>(`
    SELECT t.TITLE, t.ASSIGNED_TO, c.NAME AS CUSTOMER_NAME, t.DUE_DATE
    FROM AGRO_CRM_TASKS t
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = t.CUSTOMER_ID
    WHERE t.STATUS IN ('open','in_progress')
      AND t.DUE_DATE IS NOT NULL
      AND t.DUE_DATE < SYSDATE
    ORDER BY t.ASSIGNED_TO, t.DUE_DATE
  `);

  if (rows.length === 0)
    return NextResponse.json({ sent: false, reason: "No overdue tasks" });

  // Group by manager
  const byManager = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.ASSIGNED_TO ?? "Без исполнителя";
    if (!byManager.has(key)) byManager.set(key, []);
    byManager.get(key)!.push(r);
  }

  const lines: string[] = [`⚠️ Просроченные задачи (${rows.length}):`];
  for (const [manager, tasks] of byManager) {
    lines.push(`\n👤 ${manager} (${tasks.length}):`);
    for (const t of tasks)
      lines.push(`  • ${t.TITLE}${t.CUSTOMER_NAME ? ` — ${t.CUSTOMER_NAME}` : ""} [${fmtDate(t.DUE_DATE)}]`);
  }

  await sendText(adminChatId, lines.join("\n"));

  return NextResponse.json({ sent: true, count: rows.length });
}
