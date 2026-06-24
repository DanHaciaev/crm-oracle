import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface LeadRow { [key: string]: unknown; STATUS: string; CNT: number; MAX_DAYS: number; }
interface DealRow { [key: string]: unknown; STATUS: string; CNT: number; MAX_DAYS: number; }

export async function GET() {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [leads, deals] = await Promise.all([
    query<LeadRow>(`
      SELECT l.STATUS,
             COUNT(*) AS CNT,
             MAX(TRUNC(SYSDATE) - TRUNC(NVL(l.UPDATED_AT, l.CREATED_AT))) AS MAX_DAYS
      FROM AGRO_CRM_LEADS l
      WHERE l.STATUS NOT IN ('won', 'lost')
      GROUP BY l.STATUS
    `, []),

    query<DealRow>(`
      SELECT sd.STATUS,
             COUNT(*) AS CNT,
             MAX(TRUNC(SYSDATE) - TRUNC(sd.DOC_DATE)) AS MAX_DAYS
      FROM AGRO_SALES_DOCS sd
      WHERE sd.STATUS NOT IN ('closed', 'cancelled')
        AND sd.DOC_DATE >= ADD_MONTHS(SYSDATE, -6)
      GROUP BY sd.STATUS
    `, []),
  ]);

  return NextResponse.json({
    leads: leads.map(r => ({
      status:   String(r.STATUS),
      count:    Number(r.CNT),
      max_days: Number(r.MAX_DAYS ?? 0),
    })),
    deals: deals.map(r => ({
      status:   String(r.STATUS),
      count:    Number(r.CNT),
      max_days: Number(r.MAX_DAYS ?? 0),
    })),
  });
}
