import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const MONTHS_RU = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

type Row = Record<string, unknown>;
function n(v: unknown): number { return v == null ? 0 : Number(v); }

function linearRegression(ys: number[]): { a: number; b: number; r2: number } {
  const len = ys.length;
  if (len === 0) return { a: 0, b: 0, r2: 0 };
  const xs = Array.from({ length: len }, (_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / len;
  const meanY = ys.reduce((s, y) => s + y, 0) / len;
  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < len; i++) {
    ssXY += (xs[i] - meanX) * (ys[i] - meanY);
    ssXX += (xs[i] - meanX) ** 2;
    ssYY += (ys[i] - meanY) ** 2;
  }
  const b = ssXX === 0 ? 0 : ssXY / ssXX;
  const a = meanY - b * meanX;
  const r2 = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY);
  return { a, b, r2 };
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<Row>(`
    SELECT TO_CHAR(TRUNC(DOC_DATE,'MM'),'YYYY-MM') MON,
           NVL(SUM(NVL(TOTAL_AMOUNT_MDL,TOTAL_AMOUNT)),0) REV,
           COUNT(*) ORD
    FROM AGRO_SALES_DOCS
    WHERE DOC_DATE >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-11)
      AND DOC_DATE <  ADD_MONTHS(TRUNC(SYSDATE,'MM'),1)
      AND STATUS NOT IN ('draft','cancelled')
    GROUP BY TRUNC(DOC_DATE,'MM')
    ORDER BY TRUNC(DOC_DATE,'MM')
  `);

  // Fill gaps — ensure 12 month slots exist
  const now = new Date();
  const slots: { month: string; label: string; revenue: number; orders: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const found = rows.find(r => String(r.MON ?? "") === mon);
    slots.push({
      month: mon,
      label: MONTHS_RU[d.getMonth()] ?? mon,
      revenue: found ? n(found.REV) : 0,
      orders:  found ? n(found.ORD) : 0,
    });
  }

  const revenues = slots.map(s => s.revenue);
  const { a, b, r2 } = linearRegression(revenues);

  // Predict next 3 months
  const predicted = [1, 2, 3].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const predicted_rev = Math.max(0, Math.round(a + b * (slots.length - 1 + offset)));
    return { month: mon, label: MONTHS_RU[d.getMonth()] ?? mon, revenue: predicted_rev, forecast: true };
  });

  // Daily rate from last month actual (or average of last 3)
  const last3 = revenues.slice(-3).filter(v => v > 0);
  const dailyRate = last3.length ? last3.reduce((s, v) => s + v, 0) / last3.length / 30 : 0;

  // Trend direction: positive/negative slope
  const trend = b >= 0 ? "up" : "down";
  const trendPct = revenues[0] > 0 ? Math.round((b * 11 / revenues[0]) * 100) : 0;

  return NextResponse.json({
    actuals: slots,
    predicted,
    r2: Math.round(r2 * 100),
    trend,
    trend_pct: trendPct,
    forecast_30d:  Math.round(dailyRate * 30),
    forecast_60d:  Math.round(dailyRate * 60),
    forecast_90d:  Math.round(dailyRate * 90),
  }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=300" },
  });
}
