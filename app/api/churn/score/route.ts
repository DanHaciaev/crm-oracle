import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { groqChat } from "@/lib/groq";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface ScoreRow {
  [k: string]: unknown;
  ID:               number;
  NAME:             string;
  DAYS_SINCE_LAST:  number;
  AVG_CYCLE:        number;
  ORDER_COUNT:      number;
  LTV:              number;
  CURR_90:          number;
  PREV_90:          number;
  LAST_ORDER_DATE:  Date | string | null;
  TG_LINKED:        number;
  APP_USER_ID:      number | null;
}

export type ChurnLevel = "safe" | "at_risk" | "high_risk" | "critical";

function computeScore(r: {
  daysSince: number;
  avgCycle: number;
  curr90: number;
  prev90: number;
  orderCount: number;
}): { score: number; level: ChurnLevel } {
  const { daysSince, avgCycle, curr90, prev90, orderCount } = r;

  // Factor 1: overdue by buying cycle (0–40 pts)
  const cycleRatio   = avgCycle > 0 ? daysSince / avgCycle : 0;
  const cyclePts     = Math.min(40, cycleRatio * 20);

  // Factor 2: revenue drop last 90 days vs previous 90 days (0–40 pts)
  const revDrop      = prev90 > 0 ? (prev90 - curr90) / prev90 : 0;
  const revPts       = Math.min(40, Math.max(0, revDrop * 50));

  // Factor 3: low order count — hard to compute cycle (0–20 pts)
  const freqPts      = orderCount < 3 ? 20 : orderCount < 6 ? 10 : 0;

  const score = Math.round(Math.min(100, cyclePts + revPts + freqPts));

  const level: ChurnLevel =
    score >= 75 ? "critical" :
    score >= 50 ? "high_risk" :
    score >= 25 ? "at_risk"   : "safe";

  return { score, level };
}

async function aiExplain(name: string, daysSince: number, avgCycle: number, curr90: number, prev90: number, score: number): Promise<string | null> {
  try {
    const system = `Ты — аналитик CRM. Дай ОЧЕНЬ краткое объяснение (1 предложение) почему у клиента такой показатель риска оттока. Только факты.`;
    const user   = `Клиент: ${name}. Дней с последней покупки: ${daysSince}. Средний цикл покупки: ${avgCycle} дней. Выручка за последние 90 дней: ${curr90} MDL (предыдущие 90: ${prev90} MDL). Churn Score: ${score}/100.`;
    return await groqChat(system, user);
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<ScoreRow>(`
    SELECT * FROM (
      SELECT
        c.ID,
        c.NAME,
        ROUND(SYSDATE - ss.LAST_DATE)                           AS DAYS_SINCE_LAST,
        NVL(ss.AVG_CYCLE, 30)                                   AS AVG_CYCLE,
        ss.ORDER_COUNT,
        ROUND(ss.LTV)                                           AS LTV,
        NVL(cur90.REV, 0)                                       AS CURR_90,
        NVL(prv90.REV, 0)                                       AS PREV_90,
        ss.LAST_DATE                                            AS LAST_ORDER_DATE,
        CASE WHEN au.ID IS NOT NULL THEN 1 ELSE 0 END           AS TG_LINKED,
        au.ID                                                   AS APP_USER_ID
      FROM AGRO_CUSTOMERS c
      JOIN (
        SELECT
          CUSTOMER_ID,
          MAX(DOC_DATE)                                         AS LAST_DATE,
          COUNT(*)                                              AS ORDER_COUNT,
          NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0)     AS LTV,
          ROUND(
            (MAX(DOC_DATE) - MIN(DOC_DATE)) / NULLIF(COUNT(*) - 1, 0)
          , 0)                                                  AS AVG_CYCLE
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
        GROUP BY CUSTOMER_ID
      ) ss ON ss.CUSTOMER_ID = c.ID
      LEFT JOIN (
        SELECT CUSTOMER_ID, SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) REV
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
          AND DOC_DATE >= SYSDATE - 90
        GROUP BY CUSTOMER_ID
      ) cur90 ON cur90.CUSTOMER_ID = c.ID
      LEFT JOIN (
        SELECT CUSTOMER_ID, SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) REV
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
          AND DOC_DATE >= SYSDATE - 180
          AND DOC_DATE <  SYSDATE - 90
        GROUP BY CUSTOMER_ID
      ) prv90 ON prv90.CUSTOMER_ID = c.ID
      LEFT JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'
      WHERE c.ACTIVE = 'Y'
        AND ss.LAST_DATE >= SYSDATE - 365
    ) ORDER BY
      CASE
        WHEN CURR_90 = 0 AND PREV_90 > 0 THEN 0
        ELSE ROUND(SYSDATE - LAST_ORDER_DATE) / NULLIF(AVG_CYCLE, 0)
      END DESC
  `, []);

  // Compute scores and pick top-20 at-risk
  const scored = rows
    .map((r) => {
      const daysSince  = Number(r.DAYS_SINCE_LAST);
      const avgCycle   = Number(r.AVG_CYCLE) || 30;
      const curr90     = Number(r.CURR_90);
      const prev90     = Number(r.PREV_90);
      const orderCount = Number(r.ORDER_COUNT);
      const { score, level } = computeScore({ daysSince, avgCycle, curr90, prev90, orderCount });

      return {
        id:          Number(r.ID),
        name:        String(r.NAME),
        score,
        level,
        days_since:  daysSince,
        avg_cycle:   avgCycle,
        order_count: orderCount,
        ltv:         Number(r.LTV),
        curr_90:     curr90,
        prev_90:     prev90,
        last_order:  r.LAST_ORDER_DATE instanceof Date
          ? r.LAST_ORDER_DATE.toISOString()
          : (r.LAST_ORDER_DATE ? String(r.LAST_ORDER_DATE) : null),
        tg_linked:   Number(r.TG_LINKED) === 1,
        app_user_id: r.APP_USER_ID ? Number(r.APP_USER_ID) : null,
        explain:     null as string | null,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Enrich top-3 critical with AI explanation (to avoid rate limits)
  const critical = scored.filter((s) => s.level === "critical").slice(0, 3);
  await Promise.all(
    critical.map(async (item) => {
      item.explain = await aiExplain(item.name, item.days_since, item.avg_cycle, item.curr_90, item.prev_90, item.score);
    })
  );

  const summary = {
    critical:  scored.filter((s) => s.level === "critical").length,
    high_risk: scored.filter((s) => s.level === "high_risk").length,
    at_risk:   scored.filter((s) => s.level === "at_risk").length,
    safe:      scored.filter((s) => s.level === "safe").length,
    total:     scored.length,
  };

  return NextResponse.json({ summary, items: scored });
}
