import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface Row extends Record<string, unknown> {
  ID: number; NAME: string;
  DAYS_SINCE_LAST: number; AVG_CYCLE: number; OVERDUE_DAYS: number;
  LTV: number; ORDER_COUNT: number;
  LAST_ACTIVITY: Date | string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT
        c.ID,
        c.NAME,
        ROUND(SYSDATE - ss.LAST_DATE)                   AS DAYS_SINCE_LAST,
        ss.AVG_CYCLE,
        ROUND(SYSDATE - ss.LAST_DATE) - ss.AVG_CYCLE    AS OVERDUE_DAYS,
        ROUND(ss.LTV)                                    AS LTV,
        ss.ORDER_COUNT,
        a.LAST_ACTIVITY
      FROM AGRO_CUSTOMERS c
      JOIN (
        SELECT
          CUSTOMER_ID,
          MAX(DOC_DATE)                                                              AS LAST_DATE,
          COUNT(*)                                                                   AS ORDER_COUNT,
          NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0)                          AS LTV,
          ROUND(
            (MAX(DOC_DATE) - MIN(DOC_DATE)) / NULLIF(COUNT(*) - 1, 0)
          , 0)                                                                       AS AVG_CYCLE
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
        GROUP BY CUSTOMER_ID
        HAVING COUNT(*) >= 2
      ) ss ON ss.CUSTOMER_ID = c.ID
      LEFT JOIN (
        SELECT CUSTOMER_ID, MAX(CREATED_AT) AS LAST_ACTIVITY
        FROM AGRO_CRM_ACTIVITIES
        GROUP BY CUSTOMER_ID
      ) a ON a.CUSTOMER_ID = c.ID
      WHERE c.ACTIVE = 'Y'
        AND ss.AVG_CYCLE > 0
        AND ROUND(SYSDATE - ss.LAST_DATE) >= ss.AVG_CYCLE * 0.8
      ORDER BY
        ROUND(SYSDATE - ss.LAST_DATE) / ss.AVG_CYCLE DESC
    ) WHERE ROWNUM <= 15
  `, []);

  return NextResponse.json(rows.map((r) => {
    const daysSince  = Number(r.DAYS_SINCE_LAST);
    const avgCycle   = Number(r.AVG_CYCLE);
    const overdue    = Number(r.OVERDUE_DAYS);
    const ratio      = daysSince / avgCycle;

    const urgency: "high" | "medium" | "low" =
      ratio >= 1.5 ? "high" :
      ratio >= 1.0 ? "medium" : "low";

    return {
      id:              Number(r.ID),
      name:            String(r.NAME),
      days_since_last: daysSince,
      avg_cycle:       avgCycle,
      overdue_days:    overdue,
      ltv:             Number(r.LTV),
      order_count:     Number(r.ORDER_COUNT),
      last_activity:   iso(r.LAST_ACTIVITY),
      urgency,
    };
  }));
}
