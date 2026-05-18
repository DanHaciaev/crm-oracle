import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только admin" }, { status: 403 });

  const { id } = await params;
  const ruleId = Number(id);
  if (!Number.isFinite(ruleId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (typeof body.active === "boolean") {
    await execute(
      `UPDATE AGRO_CRM_AUTOMATION_RULES SET ACTIVE = :1 WHERE ID = :2`,
      [body.active ? "Y" : "N", ruleId]
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только admin" }, { status: 403 });

  const { id } = await params;
  const ruleId = Number(id);
  if (!Number.isFinite(ruleId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  await execute(`DELETE FROM AGRO_CRM_AUTOMATION_LOG   WHERE RULE_ID = :1`, [ruleId]);
  await execute(`DELETE FROM AGRO_CRM_AUTOMATION_RULES WHERE ID      = :1`, [ruleId]);

  return NextResponse.json({ success: true });
}
