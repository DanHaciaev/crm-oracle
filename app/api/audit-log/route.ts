import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface AuditRow {
  [key: string]: unknown;
  ID: number; ENTITY_TYPE: string; ENTITY_ID: number;
  ENTITY_NAME: string | null; ACTION: string;
  CHANGED_BY: string | null; CHANGED_AT: Date | string | null;
  OLD_VALUES: string | null; NEW_VALUES: string | null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const entityType  = sp.get("entity_type");
  const entityId    = sp.get("entity_id");
  const limit       = Math.min(Number(sp.get("limit") ?? "50"), 200);

  const typeCond = entityType ? `AND a.ENTITY_TYPE = '${entityType}'` : "";
  const idCond   = entityId   ? `AND a.ENTITY_ID   = ${Number(entityId)}` : "";

  const rows = await query<AuditRow>(`
    SELECT * FROM (
      SELECT
        a.ID, a.ENTITY_TYPE, a.ENTITY_ID, a.ENTITY_NAME,
        a.ACTION, a.CHANGED_BY, a.CHANGED_AT,
        a.OLD_VALUES, a.NEW_VALUES
      FROM AGRO_CRM_AUDIT_LOG a
      WHERE 1=1 ${typeCond} ${idCond}
      ORDER BY a.CHANGED_AT DESC
    ) WHERE ROWNUM <= ${limit}
  `, []);

  return NextResponse.json(rows.map((r) => ({
    id:           Number(r.ID),
    entity_type:  String(r.ENTITY_TYPE),
    entity_id:    Number(r.ENTITY_ID),
    entity_name:  r.ENTITY_NAME ? String(r.ENTITY_NAME) : null,
    action:       String(r.ACTION),
    changed_by:   r.CHANGED_BY ? String(r.CHANGED_BY) : null,
    changed_at:   r.CHANGED_AT instanceof Date ? r.CHANGED_AT.toISOString() : (r.CHANGED_AT ?? null),
    old_values:   r.OLD_VALUES ? String(r.OLD_VALUES) : null,
    new_values:   r.NEW_VALUES ? String(r.NEW_VALUES) : null,
  })));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id, entity_name, action, old_values, new_values } = body;

  if (!entity_type || !entity_id || !action)
    return NextResponse.json({ error: "entity_type, entity_id, action обязательны" }, { status: 400 });

  await execute(`
    INSERT INTO AGRO_CRM_AUDIT_LOG
      (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, OLD_VALUES, NEW_VALUES)
    VALUES (:1, :2, :3, :4, :5, :6, :7)
  `, [
    String(entity_type),
    Number(entity_id),
    entity_name ? String(entity_name) : null,
    String(action),
    user.username,
    old_values ? JSON.stringify(old_values) : null,
    new_values ? JSON.stringify(new_values) : null,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
