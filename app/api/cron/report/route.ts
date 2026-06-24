import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

interface MetricRow {
  [key: string]: unknown;
  METRIC: string;
  VAL:    number;
}

function fmt(n: number, decimals = 0) {
  return new Intl.NumberFormat("ru-MD", { maximumFractionDigits: decimals }).format(n);
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  const rows = await query<MetricRow>(`
    SELECT 'deals_yday'    AS METRIC, COUNT(*)                       AS VAL FROM AGRO_SALES_DOCS WHERE TRUNC(DOC_DATE)    = TRUNC(SYSDATE - 1) AND STATUS NOT IN ('draft','cancelled')
    UNION ALL
    SELECT 'revenue_yday'  AS METRIC, NVL(SUM(TOTAL_AMOUNT_MDL),0)  AS VAL FROM AGRO_SALES_DOCS WHERE TRUNC(DOC_DATE)    = TRUNC(SYSDATE - 1) AND STATUS NOT IN ('draft','cancelled')
    UNION ALL
    SELECT 'revenue_month' AS METRIC, NVL(SUM(TOTAL_AMOUNT_MDL),0)  AS VAL FROM AGRO_SALES_DOCS WHERE DOC_DATE >= TRUNC(SYSDATE,'MM')         AND STATUS NOT IN ('draft','cancelled')
    UNION ALL
    SELECT 'leads_yday'    AS METRIC, COUNT(*)                       AS VAL FROM AGRO_CRM_LEADS   WHERE TRUNC(CREATED_AT) = TRUNC(SYSDATE - 1)
    UNION ALL
    SELECT 'leads_open'    AS METRIC, COUNT(*)                       AS VAL FROM AGRO_CRM_LEADS   WHERE STATUS NOT IN ('won','lost')
    UNION ALL
    SELECT 'tasks_overdue' AS METRIC, COUNT(*)                       AS VAL FROM AGRO_CRM_TASKS   WHERE STATUS IN ('open','in_progress') AND DUE_DATE IS NOT NULL AND DUE_DATE < SYSDATE
    UNION ALL
    SELECT 'acts_yday'     AS METRIC, COUNT(*)                       AS VAL FROM AGRO_CRM_ACTIVITIES WHERE TRUNC(CREATED_AT) = TRUNC(SYSDATE - 1)
  `, []);

  const m: Record<string, number> = {};
  for (const r of rows) m[String(r.METRIC)] = Number(r.VAL);

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  const lines = [
    `📊 Итоги вчерашнего дня — ${yesterday}`,
    ``,
    `💰 Продажи`,
    `  Сделок: ${m.deals_yday ?? 0}`,
    `  Выручка: ${fmt(m.revenue_yday ?? 0)} MDL`,
    `  Выручка за месяц: ${fmt(m.revenue_month ?? 0)} MDL`,
    ``,
    `🎯 Лиды`,
    `  Новых за день: ${m.leads_yday ?? 0}`,
    `  Открытых всего: ${m.leads_open ?? 0}`,
    ``,
    `✅ Активности`,
    `  Действий за день: ${m.acts_yday ?? 0}`,
    m.tasks_overdue > 0 ? `  ⚠️ Просроченных задач: ${m.tasks_overdue}` : `  Просроченных задач: нет`,
  ];

  const text = lines.join("\n");

  if (adminChatId) {
    await sendText(adminChatId, text);
  }

  return NextResponse.json({
    sent:    !!adminChatId,
    report:  text,
    metrics: m,
  });
}
