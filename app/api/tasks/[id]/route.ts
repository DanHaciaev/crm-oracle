import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const VALID_STATUSES   = new Set(["open","in_progress","done","cancelled"]);
const VALID_PRIORITIES = new Set(["low","normal","high","urgent"]);

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { status, title, priority, due_date, assigned_to, notes } = body;

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (status   !== undefined) {
    if (!VALID_STATUSES.has(String(status))) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    binds.push(status); sets.push(`STATUS = :${binds.length}`);
  }
  if (title    !== undefined) { binds.push(String(title)); sets.push(`TITLE = :${binds.length}`); }
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.has(String(priority))) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    binds.push(priority); sets.push(`PRIORITY = :${binds.length}`);
  }
  if (due_date    !== undefined) { binds.push(due_date ?? null); sets.push(`DUE_DATE = TO_DATE(:${binds.length},'YYYY-MM-DD')`); }
  if (assigned_to !== undefined) { binds.push(assigned_to ?? null); sets.push(`ASSIGNED_TO = :${binds.length}`); }
  if (notes       !== undefined) { binds.push(notes ?? null);       sets.push(`NOTES = :${binds.length}`); }

  if (!sets.length) return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  binds.push(taskId);
  await execute(
    `UPDATE AGRO_CRM_TASKS SET ${sets.join(", ")} WHERE ID = :${binds.length}`,
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
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const rows = await query<{ ID: number }>(`SELECT ID FROM AGRO_CRM_TASKS WHERE ID = :1`, [taskId]);
  if (!rows.length) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });

  await execute(`DELETE FROM AGRO_CRM_TASKS WHERE ID = :1`, [taskId]);
  return NextResponse.json({ success: true });
}
