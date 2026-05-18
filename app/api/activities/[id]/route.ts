import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const actId = Number(id);
  if (!Number.isFinite(actId))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const rows = await query<{ ID: number; CREATED_BY: string | null }>(`
    SELECT ID, CREATED_BY FROM AGRO_CRM_ACTIVITIES WHERE ID = :1
  `, [actId]);

  if (!rows.length)
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  if (user.role !== "admin" && rows[0].CREATED_BY !== user.username)
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });

  await execute(`DELETE FROM AGRO_CRM_ACTIVITIES WHERE ID = :1`, [actId]);

  return NextResponse.json({ success: true });
}
