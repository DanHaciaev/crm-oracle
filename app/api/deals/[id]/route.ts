import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const VALID_STAGES = new Set(["lead","qualified","proposal","negotiation","won","lost"]);

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const dealId = Number(id);
  if (!Number.isFinite(dealId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { stage, title, amount, probability, expected_date, assigned_to, notes } = body;

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (stage !== undefined) {
    if (!VALID_STAGES.has(String(stage))) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    binds.push(stage); sets.push(`STAGE = :${binds.length}`);
  }
  if (title     !== undefined) { binds.push(String(title));   sets.push(`TITLE = :${binds.length}`); }
  if (amount    !== undefined) { binds.push(amount !== null && amount !== "" ? Number(amount) : null); sets.push(`AMOUNT = :${binds.length}`); }
  if (probability !== undefined) { binds.push(Number(probability)); sets.push(`PROBABILITY = :${binds.length}`); }
  if (expected_date !== undefined) {
    binds.push(expected_date ?? null);
    sets.push(`EXPECTED_DATE = TO_DATE(:${binds.length},'YYYY-MM-DD')`);
  }
  if (assigned_to !== undefined) { binds.push(assigned_to ?? null); sets.push(`ASSIGNED_TO = :${binds.length}`); }
  if (notes       !== undefined) { binds.push(notes ?? null);       sets.push(`NOTES = :${binds.length}`); }

  if (!sets.length) return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  binds.push(dealId);
  await execute(
    `UPDATE AGRO_CRM_DEALS SET ${sets.join(", ")} WHERE ID = :${binds.length}`,
    binds as (string | number | null)[]
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const dealId = Number(id);
  if (!Number.isFinite(dealId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const rows = await query<{ ID: number }>(`SELECT ID FROM AGRO_CRM_DEALS WHERE ID = :1`, [dealId]);
  if (!rows.length) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });

  await execute(`UPDATE AGRO_CRM_TASKS SET DEAL_ID = NULL WHERE DEAL_ID = :1`, [dealId]);
  await execute(`DELETE FROM AGRO_CRM_DEALS WHERE ID = :1`, [dealId]);

  return NextResponse.json({ success: true });
}
