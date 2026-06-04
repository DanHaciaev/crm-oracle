import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

const VALID_STATUSES = new Set(["draft", "confirmed", "shipped", "delivered", "closed", "cancelled"]);

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const status = String(body.status ?? "");

  if (!VALID_STATUSES.has(status))
    return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });

  await execute(
    `UPDATE AGRO_SALES_DOCS SET STATUS = :1 WHERE ID = :2`,
    [status, docId]
  );

  return NextResponse.json({ ok: true });
}
