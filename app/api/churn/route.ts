import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { subDays, startOfYear, format, addDays } from "date-fns";

interface ChurnRow {
  [key: string]: unknown;
  ID:          number;
  NAME:        string;
  CA:          number;
  PA:          number;
  PC:          number;
  LAST_DATE:   Date | string | null;
  TG_LINKED:   number;
  APP_USER_ID: number | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function getPeriodDates(period: string) {
  const now = new Date();
  let from: Date;
  switch (period) {
    case "7d":  from = subDays(now, 7);  break;
    case "90d": from = subDays(now, 90); break;
    case "ytd": from = startOfYear(now); break;
    default:    from = subDays(now, 30);
  }
  const span = now.getTime() - from.getTime();
  return {
    f:  format(from,           "yyyy-MM-dd"),
    t:  format(addDays(now,1), "yyyy-MM-dd"),
    pf: format(new Date(from.getTime() - span), "yyyy-MM-dd"),
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const period    = sp.get("period")    ?? "30d";
  const threshold = Math.abs(Number(sp.get("threshold") ?? "30")); // % drop, e.g. 30 = показать тех кто упал >30%

  const { f, t, pf } = getPeriodDates(period);

  const rows = await query<ChurnRow>(`
    SELECT
      c.ID,
      c.NAME,
      NVL(cur.A, 0)                            AS CA,
      prv.A                                    AS PA,
      ROUND((NVL(cur.A,0) / prv.A - 1)*100, 1) AS PC,
      prv.LAST_DATE,
      CASE WHEN au.ID IS NOT NULL THEN 1 ELSE 0 END AS TG_LINKED,
      au.ID AS APP_USER_ID
    FROM AGRO_CUSTOMERS c
    JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) A,
             MAX(DOC_DATE) LAST_DATE
      FROM AGRO_SALES_DOCS
      WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
        AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
        AND STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) prv ON c.ID = prv.CUSTOMER_ID
    LEFT JOIN (
      SELECT CUSTOMER_ID, SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) A
      FROM AGRO_SALES_DOCS
      WHERE DOC_DATE >= TO_DATE(:3,'YYYY-MM-DD')
        AND DOC_DATE <  TO_DATE(:4,'YYYY-MM-DD')
        AND STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) cur ON c.ID = cur.CUSTOMER_ID
    LEFT JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'
    WHERE NVL(cur.A,0) < prv.A * ((100 - :5) / 100)
    ORDER BY PC ASC
  `, [pf, f, f, t, threshold]);

  return NextResponse.json({
    period,
    threshold,
    date_from: pf,
    date_to:   t,
    prev_from: pf,
    prev_to:   f,
    curr_from: f,
    curr_to:   t,
    items: rows.map((r) => ({
      id:          r.ID,
      name:        String(r.NAME ?? ""),
      curr:        Number(r.CA  ?? 0),
      prev:        Number(r.PA  ?? 0),
      pct:         Number(r.PC  ?? 0),
      last_date:   r.LAST_DATE instanceof Date ? r.LAST_DATE.toISOString() : (r.LAST_DATE ?? null),
      tg_linked:   Number(r.TG_LINKED) === 1,
      app_user_id: r.APP_USER_ID ?? null,
    })),
  });
}
