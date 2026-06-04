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

  const data = rows.map(r => {
    const mon = String(r.MON ?? "");
    const mIdx = parseInt(mon.split("-")[1] ?? "1") - 1;
    return { month: mon, label: MONTHS_RU[mIdx] ?? mon, revenue: n(r.REV), orders: n(r.ORD) };
  });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=300" },
  });
}
