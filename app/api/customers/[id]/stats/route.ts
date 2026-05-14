import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface TotalRow  { [key: string]: unknown; TOTAL_REV: number; TOTAL_KG: number; ORDER_COUNT: number; LAST_DATE: Date | string | null; FIRST_DATE: Date | string | null; }
interface MonthRow  { [key: string]: unknown; MON: string; REV: number; ORD: number; }
interface AvgRow    { [key: string]: unknown; AVG_DAYS: number | null; }

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });

  // ── 1. Общие KPI ──────────────────────────────────────────────────────────
  const totalRows = await query<TotalRow>(`
    SELECT
      NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0)  AS TOTAL_REV,
      NVL(SUM(TOTAL_NET_KG), 0)                         AS TOTAL_KG,
      COUNT(*)                                           AS ORDER_COUNT,
      MAX(DOC_DATE)                                      AS LAST_DATE,
      MIN(DOC_DATE)                                      AS FIRST_DATE
    FROM AGRO_SALES_DOCS
    WHERE CUSTOMER_ID = :1
      AND STATUS NOT IN ('draft','cancelled')
  `, [customerId]);

  const t = totalRows[0] ?? {};
  const totalRev   = Number(t.TOTAL_REV   ?? 0);
  const totalKg    = Number(t.TOTAL_KG    ?? 0);
  const orderCount = Number(t.ORDER_COUNT ?? 0);
  const lastDate   = iso(t.LAST_DATE  as Date | string | null);
  const firstDate  = iso(t.FIRST_DATE as Date | string | null);
  const avgCheck   = orderCount > 0 ? totalRev / orderCount : 0;

  // ── 2. Средний интервал между заказами ────────────────────────────────────
  const avgRows = await query<AvgRow>(`
    SELECT ROUND(AVG(diff), 0) AS AVG_DAYS FROM (
      SELECT DOC_DATE - LAG(DOC_DATE) OVER (ORDER BY DOC_DATE) AS diff
      FROM AGRO_SALES_DOCS
      WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
    ) WHERE diff IS NOT NULL
  `, [customerId]);
  const avgDaysBetween = avgRows[0]?.AVG_DAYS !== null ? Number(avgRows[0]?.AVG_DAYS ?? 0) : null;

  // ── 3. Помесячная выручка (последние 18 месяцев) ──────────────────────────
  const monthRows = await query<MonthRow>(`
    SELECT TO_CHAR(TRUNC(DOC_DATE,'MM'),'YYYY-MM') MON,
           NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0) REV,
           COUNT(*) ORD
    FROM AGRO_SALES_DOCS
    WHERE CUSTOMER_ID = :1
      AND STATUS NOT IN ('draft','cancelled')
      AND DOC_DATE >= ADD_MONTHS(TRUNC(SYSDATE,'MM'), -17)
    GROUP BY TRUNC(DOC_DATE,'MM')
    ORDER BY TRUNC(DOC_DATE,'MM')
  `, [customerId]);

  // ── 4. Риск оттока (сравниваем текущие 30 дней vs предыдущие 30 дней) ─────
  const churnRows = await query<{ [key: string]: unknown; CUR: number; PRV: number }>(`
    SELECT
      NVL((SELECT SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) FROM AGRO_SALES_DOCS
           WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
             AND DOC_DATE >= SYSDATE - 30), 0) AS CUR,
      NVL((SELECT SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) FROM AGRO_SALES_DOCS
           WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
             AND DOC_DATE >= SYSDATE - 60 AND DOC_DATE < SYSDATE - 30), 0) AS PRV
    FROM DUAL
  `, [customerId]);

  const cur = Number(churnRows[0]?.CUR ?? 0);
  const prv = Number(churnRows[0]?.PRV ?? 0);
  const churnPct = prv > 0 ? Math.round((cur / prv - 1) * 100) : null;

  return NextResponse.json({
    total_revenue:     totalRev,
    total_net_kg:      totalKg,
    order_count:       orderCount,
    avg_check:         Math.round(avgCheck),
    last_order_date:   lastDate,
    first_order_date:  firstDate,
    avg_days_between:  avgDaysBetween,
    churn_pct:         churnPct,
    churn_cur:         cur,
    churn_prv:         prv,
    monthly: monthRows.map((r) => ({
      month:  String(r.MON ?? ""),
      revenue: Number(r.REV ?? 0),
      orders:  Number(r.ORD ?? 0),
    })),
  });
}
