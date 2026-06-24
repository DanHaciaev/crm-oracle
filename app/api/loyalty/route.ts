import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

let tablesReady = false;

export async function ensureLoyaltyTables() {
  if (tablesReady) return;
  const rows = await query<{ CNT: number }>(
    `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_LOYALTY_TIERS'`,
    []
  );
  if (Number(rows[0]?.CNT ?? 0) === 0) {
    throw new Error("Таблицы не созданы. Запусти: node scripts/run-sql.mjs sql/loyalty_tables.sql");
  }
  tablesReady = true;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface MemberRow {
  MEMBER_ID: number;
  CUSTOMER_ID: number;
  CUSTOMER_NAME: string;
  TOTAL_POINTS: number;
  TIER_ID: number | null;
  TIER_NAME: string | null;
  TIER_COLOR: string | null;
  ENROLLED_AT: Date | string | null;
}

interface StatsRow {
  TOTAL_MEMBERS: number;
  TOTAL_POINTS: number;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureLoyaltyTables();

  const sp   = req.nextUrl.searchParams;
  const view = sp.get("view");

  if (view === "stats") {
    const stats = await query<StatsRow>(`
      SELECT
        COUNT(*) AS TOTAL_MEMBERS,
        NVL(SUM(TOTAL_POINTS), 0) AS TOTAL_POINTS
      FROM AGRO_CRM_LOYALTY_MEMBERS
    `);

    const tierDist = await query<{ TIER_NAME: string | null; COLOR: string | null; CNT: number }>(`
      SELECT t.NAME AS TIER_NAME, t.COLOR, COUNT(m.ID) AS CNT
      FROM AGRO_CRM_LOYALTY_TIERS t
      LEFT JOIN AGRO_CRM_LOYALTY_MEMBERS m ON m.TIER_ID = t.ID
      GROUP BY t.ID, t.NAME, t.COLOR
      ORDER BY t.SORT_ORDER
    `);

    return NextResponse.json({
      total_members: Number(stats[0]?.TOTAL_MEMBERS ?? 0),
      total_points:  Number(stats[0]?.TOTAL_POINTS  ?? 0),
      tier_dist: tierDist.map(r => ({
        name:  r.TIER_NAME ? String(r.TIER_NAME) : "Без уровня",
        color: r.COLOR     ? String(r.COLOR)     : "gray",
        count: Number(r.CNT),
      })),
    });
  }

  // Default: member list
  const members = await query<MemberRow>(`
    SELECT * FROM (
      SELECT
        m.ID AS MEMBER_ID, m.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
        m.TOTAL_POINTS, m.TIER_ID,
        t.NAME AS TIER_NAME, t.COLOR AS TIER_COLOR, m.ENROLLED_AT
      FROM AGRO_CRM_LOYALTY_MEMBERS m
      JOIN AGRO_CUSTOMERS c ON c.ID = m.CUSTOMER_ID
      LEFT JOIN AGRO_CRM_LOYALTY_TIERS t ON t.ID = m.TIER_ID
      ORDER BY m.TOTAL_POINTS DESC
    ) WHERE ROWNUM <= 200
  `);

  return NextResponse.json(members.map(r => ({
    member_id:     Number(r.MEMBER_ID),
    customer_id:   Number(r.CUSTOMER_ID),
    customer_name: String(r.CUSTOMER_NAME),
    total_points:  Number(r.TOTAL_POINTS),
    tier_id:       r.TIER_ID   ? Number(r.TIER_ID)   : null,
    tier_name:     r.TIER_NAME ? String(r.TIER_NAME) : null,
    tier_color:    r.TIER_COLOR ? String(r.TIER_COLOR) : null,
    enrolled_at:   iso(r.ENROLLED_AT as Date | string | null),
  })));
}
