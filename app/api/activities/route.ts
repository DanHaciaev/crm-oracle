import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ActivityRow {
  [key: string]: unknown;
  ID: number;
  CUSTOMER_ID: number;
  ACT_TYPE: string;
  BODY: string | null;
  OUTCOME: string | null;
  CREATED_BY: string | null;
  CREATED_AT: Date | string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

const VALID_TYPES = new Set(["call", "meeting", "note", "email", "other"]);

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const customerId = sp.get("customer_id") ? Number(sp.get("customer_id")) : null;

  if (!customerId)
    return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });

  const rows = await query<ActivityRow>(`
    SELECT * FROM (
      SELECT
        a.ID, a.CUSTOMER_ID, a.ACT_TYPE,
        a.BODY, a.OUTCOME, a.CREATED_BY, a.CREATED_AT
      FROM AGRO_CRM_ACTIVITIES a
      WHERE a.CUSTOMER_ID = :1
      ORDER BY a.CREATED_AT DESC
    ) WHERE ROWNUM <= 100
  `, [customerId]);

  return NextResponse.json(rows.map((r) => ({
    id:          Number(r.ID),
    customer_id: Number(r.CUSTOMER_ID),
    act_type:    String(r.ACT_TYPE ?? "note"),
    body:        r.BODY  ? String(r.BODY)  : null,
    outcome:     r.OUTCOME ? String(r.OUTCOME) : null,
    created_by:  r.CREATED_BY ? String(r.CREATED_BY) : null,
    created_at:  iso(r.CREATED_AT as Date | string | null),
  })));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { customer_id, act_type, body: text, outcome } = body;

  if (!customer_id)
    return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });
  if (!act_type || !VALID_TYPES.has(String(act_type)))
    return NextResponse.json({ error: "act_type должен быть call/meeting/note/email/other" }, { status: 400 });

  await execute(`
    INSERT INTO AGRO_CRM_ACTIVITIES
      (CUSTOMER_ID, ACT_TYPE, BODY, OUTCOME, CREATED_BY)
    VALUES (:1, :2, :3, :4, :5)
  `, [
    Number(customer_id),
    String(act_type),
    text    ? String(text)    : null,
    outcome ? String(outcome) : null,
    user.username,
  ]);

  const rows = await query<{ ID: number }>(`
    SELECT MAX(ID) AS ID FROM AGRO_CRM_ACTIVITIES
    WHERE CUSTOMER_ID = :1 AND CREATED_BY = :2
  `, [Number(customer_id), user.username]);

  return NextResponse.json({ id: rows[0]?.ID ?? null, success: true }, { status: 201 });
}
