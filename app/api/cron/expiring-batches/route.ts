import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

interface BatchRow {
  [key: string]: unknown;
  BATCH_ID:       number;
  BATCH_NUMBER:   string;
  ITEM_NAME_RU:   string;
  WAREHOUSE_NAME: string | null;
  CURRENT_QTY_KG: number;
  EXPIRY_DATE:    Date | string;
  DAYS_LEFT:      number;
}

function fmtDate(v: Date | string) {
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU");
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await query<BatchRow>(`
    SELECT BATCH_ID, BATCH_NUMBER, ITEM_NAME_RU, WAREHOUSE_NAME,
           CURRENT_QTY_KG,
           EXPIRY_DATE,
           ROUND(EXPIRY_DATE - SYSDATE) AS DAYS_LEFT
    FROM AGRO_V_STOCK_BALANCE
    WHERE IS_EXPIRED = 'N'
      AND EXPIRY_DATE IS NOT NULL
      AND EXPIRY_DATE <= TRUNC(SYSDATE) + 14
      AND CURRENT_QTY_KG > 0
    ORDER BY EXPIRY_DATE
  `);

  if (rows.length === 0)
    return NextResponse.json({ alerted: 0, reason: "No expiring batches in next 14 days" });

  for (const row of rows) {
    const title = `Партия ${row.BATCH_NUMBER} (${row.ITEM_NAME_RU}) истекает через ${row.DAYS_LEFT} дн. — ${row.CURRENT_QTY_KG.toFixed(1)} кг`;
    await execute(
      `INSERT INTO AGRO_CRM_TASKS (TITLE, STATUS, PRIORITY, DUE_DATE, CREATED_AT, UPDATED_AT)
       SELECT :1, 'open', 'high', SYSDATE + 1, SYSDATE, SYSDATE FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM AGRO_CRM_TASKS
         WHERE TITLE LIKE :2 AND CREATED_AT > SYSDATE - 1
       )`,
      [title, `%Партия ${row.BATCH_NUMBER}%`]
    );
  }

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (adminChatId) {
    const lines: string[] = [`⏳ Истекающие партии (${rows.length}):`];
    for (const r of rows) {
      const wh = r.WAREHOUSE_NAME ? ` [${r.WAREHOUSE_NAME}]` : "";
      lines.push(`  • ${r.BATCH_NUMBER} — ${r.ITEM_NAME_RU}${wh}: ${r.CURRENT_QTY_KG.toFixed(1)} кг, истекает ${fmtDate(r.EXPIRY_DATE)} (через ${r.DAYS_LEFT} дн.)`);
    }
    await sendText(adminChatId, lines.join("\n"));
  }

  return NextResponse.json({ alerted: rows.length });
}
