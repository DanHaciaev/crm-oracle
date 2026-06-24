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

async function getDefaultTierId(): Promise<number | null> {
  const rows = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CRM_LOYALTY_TIERS ORDER BY MIN_POINTS ASC`,
    []
  );
  return rows[0]?.ID ? Number(rows[0].ID) : null;
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try { await ensureLoyaltyTables(); } catch {
    return NextResponse.json({ error: "Таблицы лояльности не созданы. Запусти: node scripts/run-sql.mjs sql/loyalty_tables.sql" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const customerId = body.customer_id ? Number(body.customer_id) : null;
  if (!customerId) return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });

  // Check customer exists
  const cust = await query<{ ID: number }>(`SELECT ID FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]);
  if (!cust.length) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  // Check if already enrolled
  const existing = await query<{ ID: number }>(
    `SELECT ID FROM AGRO_CRM_LOYALTY_MEMBERS WHERE CUSTOMER_ID = :1`, [customerId]
  );
  if (existing.length) return NextResponse.json({ error: "Клиент уже в программе" }, { status: 409 });

  const tierId = await getDefaultTierId();

  await execute(`
    INSERT INTO AGRO_CRM_LOYALTY_MEMBERS (CUSTOMER_ID, TOTAL_POINTS, TIER_ID)
    VALUES (:1, 0, :2)
  `, [customerId, tierId]);

  return NextResponse.json({ success: true }, { status: 201 });
}
