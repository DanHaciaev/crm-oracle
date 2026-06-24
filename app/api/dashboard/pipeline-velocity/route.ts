import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

type Row = Record<string, unknown>;

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const [stageRows, cycleRows] = await Promise.all([
      query<Row>(`
        SELECT STATUS,
          ROUND(AVG(SYSDATE - CAST(NVL(UPDATED_AT, CREATED_AT) AS DATE)), 1) AS AVG_DAYS,
          COUNT(*) AS CNT
        FROM AGRO_CRM_LEADS
        WHERE STATUS NOT IN ('won', 'lost')
        GROUP BY STATUS
        ORDER BY CASE STATUS
          WHEN 'new'       THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'proposal'  THEN 4
          ELSE 5 END
      `, []),
      query<Row>(`
        SELECT
          ROUND(AVG(CAST(NVL(UPDATED_AT, SYSDATE) AS DATE) - CAST(CREATED_AT AS DATE)), 1) AS AVG_CYCLE,
          COUNT(*) AS WON_COUNT
        FROM AGRO_CRM_LEADS
        WHERE STATUS = 'won'
      `, []),
    ]);

    return NextResponse.json({
      stages:    stageRows,
      won_cycle: cycleRows[0] ?? null,
      debug:     { stageCount: stageRows.length, cycleRow: cycleRows[0] },
    });
  } catch (err) {
    console.error("pipeline-velocity error:", err);
    return NextResponse.json({ error: String(err), stages: [], won_cycle: null }, { status: 500 });
  }
}
