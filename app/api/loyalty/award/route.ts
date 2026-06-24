import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { ensureLoyaltyTables } from "@/app/api/loyalty/route";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

async function recalcTier(memberId: number, totalPoints: number): Promise<void> {
  const tiers = await query<{ ID: number; MIN_POINTS: number }>(
    `SELECT ID, MIN_POINTS FROM AGRO_CRM_LOYALTY_TIERS ORDER BY MIN_POINTS DESC`
  );
  const tier = tiers.find(t => totalPoints >= Number(t.MIN_POINTS));
  if (!tier) return;
  await execute(
    `UPDATE AGRO_CRM_LOYALTY_MEMBERS SET TIER_ID = :1 WHERE ID = :2`,
    [Number(tier.ID), memberId]
  );
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureLoyaltyTables();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { customer_id, points, description, tx_type } = body;

  if (!customer_id) return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });
  if (!points || isNaN(Number(points))) return NextResponse.json({ error: "points обязателен" }, { status: 400 });

  const pts = Number(points);

  const members = await query<{ ID: number; TOTAL_POINTS: number }>(
    `SELECT ID, TOTAL_POINTS FROM AGRO_CRM_LOYALTY_MEMBERS WHERE CUSTOMER_ID = :1`,
    [Number(customer_id)]
  );
  if (!members.length) return NextResponse.json({ error: "Клиент не найден в программе лояльности" }, { status: 404 });

  const member = members[0];
  const memberId   = Number(member.ID);
  const newTotal   = Math.max(0, Number(member.TOTAL_POINTS) + pts);

  await execute(`
    UPDATE AGRO_CRM_LOYALTY_MEMBERS SET TOTAL_POINTS = :1 WHERE ID = :2
  `, [newTotal, memberId]);

  await execute(`
    INSERT INTO AGRO_CRM_LOYALTY_TX (MEMBER_ID, POINTS, TX_TYPE, DESCRIPTION)
    VALUES (:1, :2, :3, :4)
  `, [
    memberId,
    pts,
    tx_type ? String(tx_type) : (pts >= 0 ? "manual_award" : "manual_deduct"),
    description ? String(description).slice(0, 500) : null,
  ]);

  await recalcTier(memberId, newTotal);

  return NextResponse.json({ success: true, new_total: newTotal });
}
