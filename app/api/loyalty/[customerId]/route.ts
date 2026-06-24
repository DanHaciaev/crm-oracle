import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { ensureLoyaltyTables } from "@/app/api/loyalty/route";

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
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try { await ensureLoyaltyTables(); } catch { /* таблицы не созданы — вернём enrolled: false */ }

  const { customerId } = await params;
  const id = Number(customerId);

  let members: { ID: number; CUSTOMER_ID: number; TOTAL_POINTS: number; TIER_ID: number | null; TIER_NAME: string | null; TIER_COLOR: string | null; ENROLLED_AT: Date | string | null }[];
  try {
    members = await query<{
      ID: number; CUSTOMER_ID: number; TOTAL_POINTS: number;
      TIER_ID: number | null; TIER_NAME: string | null; TIER_COLOR: string | null;
      ENROLLED_AT: Date | string | null;
    }>(`
      SELECT m.ID, m.CUSTOMER_ID, m.TOTAL_POINTS, m.TIER_ID,
             t.NAME AS TIER_NAME, t.COLOR AS TIER_COLOR, m.ENROLLED_AT
      FROM AGRO_CRM_LOYALTY_MEMBERS m
      LEFT JOIN AGRO_CRM_LOYALTY_TIERS t ON t.ID = m.TIER_ID
      WHERE m.CUSTOMER_ID = :1
    `, [id]);
  } catch {
    return NextResponse.json({ enrolled: false });
  }

  if (!members.length) return NextResponse.json({ enrolled: false });

  const m = members[0];

  let txRows: { ID: number; POINTS: number; TX_TYPE: string | null; DESCRIPTION: string | null; CREATED_AT: Date | string | null }[] = [];
  try {
    txRows = await query<{
      ID: number; POINTS: number; TX_TYPE: string | null;
      DESCRIPTION: string | null; CREATED_AT: Date | string | null;
    }>(`
      SELECT * FROM (
        SELECT ID, POINTS, TX_TYPE, DESCRIPTION, CREATED_AT
        FROM AGRO_CRM_LOYALTY_TX
        WHERE MEMBER_ID = :1
        ORDER BY CREATED_AT DESC
      ) WHERE ROWNUM <= 50
    `, [Number(m.ID)]);
  } catch { /* нет транзакций */ }

  return NextResponse.json({
    enrolled:     true,
    member_id:    Number(m.ID),
    customer_id:  Number(m.CUSTOMER_ID),
    total_points: Number(m.TOTAL_POINTS),
    tier_id:      m.TIER_ID    ? Number(m.TIER_ID)    : null,
    tier_name:    m.TIER_NAME  ? String(m.TIER_NAME)  : null,
    tier_color:   m.TIER_COLOR ? String(m.TIER_COLOR) : null,
    enrolled_at:  iso(m.ENROLLED_AT as Date | string | null),
    transactions: txRows.map(r => ({
      id:          Number(r.ID),
      points:      Number(r.POINTS),
      tx_type:     r.TX_TYPE     ? String(r.TX_TYPE)     : null,
      description: r.DESCRIPTION ? String(r.DESCRIPTION) : null,
      created_at:  iso(r.CREATED_AT as Date | string | null),
    })),
  });
}
