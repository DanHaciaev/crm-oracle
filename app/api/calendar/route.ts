import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface TaskRow {
  [key: string]: unknown;
  ID: number; TITLE: string;
  CUSTOMER_ID: number | null; CUSTOMER_NAME: string | null;
  ASSIGNED_TO: string | null; DUE_DATE: Date | string | null;
  PRIORITY: string; STATUS: string;
}

function isoDate(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const year  = parseInt(sp.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get("month") ?? String(new Date().getMonth() + 1), 10);

  const rows = await query<TaskRow>(`
    SELECT t.ID, t.TITLE, t.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
           t.ASSIGNED_TO, t.DUE_DATE, t.PRIORITY, t.STATUS
    FROM AGRO_CRM_TASKS t
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = t.CUSTOMER_ID
    WHERE t.DUE_DATE IS NOT NULL
      AND EXTRACT(YEAR  FROM t.DUE_DATE) = :1
      AND EXTRACT(MONTH FROM t.DUE_DATE) = :2
      AND t.STATUS NOT IN ('cancelled')
    ORDER BY t.DUE_DATE ASC,
      CASE t.PRIORITY WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END
  `, [year, month]);

  const tasks = rows.map(r => ({
    id:            r.ID,
    title:         r.TITLE,
    customer_name: r.CUSTOMER_NAME ?? null,
    assigned_to:   r.ASSIGNED_TO ?? null,
    due_date:      isoDate(r.DUE_DATE),
    priority:      r.PRIORITY,
    status:        r.STATUS,
  }));

  return NextResponse.json(tasks);
}
