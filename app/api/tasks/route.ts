import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface TaskRow {
  [key: string]: unknown;
  ID: number; TITLE: string;
  CUSTOMER_ID: number | null; CUSTOMER_NAME: string | null;
  DEAL_ID: number | null; DEAL_TITLE: string | null;
  ASSIGNED_TO: string | null; DUE_DATE: Date | string | null;
  PRIORITY: string; STATUS: string; NOTES: string | null;
  CREATED_BY: string | null; CREATED_AT: Date | string | null;
  COMPLETED_AT: Date | string | null;
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

function mapTask(r: TaskRow) {
  return {
    id:            r.ID,
    title:         r.TITLE,
    customer_id:   r.CUSTOMER_ID ?? null,
    customer_name: r.CUSTOMER_NAME ?? null,
    deal_id:       r.DEAL_ID ?? null,
    deal_title:    r.DEAL_TITLE ?? null,
    assigned_to:   r.ASSIGNED_TO ?? null,
    due_date:      iso(r.DUE_DATE),
    priority:      r.PRIORITY,
    status:        r.STATUS,
    notes:         r.NOTES ?? "",
    created_by:    r.CREATED_BY ?? null,
    created_at:    iso(r.CREATED_AT),
    completed_at:  iso(r.COMPLETED_AT),
  };
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const status     = sp.get("status");
  const customerId = sp.get("customer_id");

  const VALID_STATUSES = new Set(["open","in_progress","done","cancelled"]);
  const statusCond = status && VALID_STATUSES.has(status) ? `AND t.STATUS = '${status}'` : "";
  const custCond   = customerId ? `AND t.CUSTOMER_ID = ${Number(customerId)}` : "";

  const rows = await query<TaskRow>(`
    SELECT t.ID, t.TITLE, t.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
           t.DEAL_ID, d.TITLE AS DEAL_TITLE,
           t.ASSIGNED_TO, t.DUE_DATE, t.PRIORITY, t.STATUS,
           t.NOTES, t.CREATED_BY, t.CREATED_AT, t.COMPLETED_AT
    FROM AGRO_CRM_TASKS t
    LEFT JOIN AGRO_CUSTOMERS c  ON c.ID = t.CUSTOMER_ID
    LEFT JOIN AGRO_CRM_DEALS  d ON d.ID = t.DEAL_ID
    WHERE 1=1 ${statusCond} ${custCond}
    ORDER BY
      CASE t.PRIORITY WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      t.DUE_DATE ASC NULLS LAST,
      t.CREATED_AT DESC
  `, []);

  return NextResponse.json(rows.map(mapTask));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { title, customer_id, deal_id, assigned_to, due_date, priority, notes } = body;

  if (!title) return NextResponse.json({ error: "title обязателен" }, { status: 400 });

  const VALID_PRIORITIES = new Set(["low","normal","high","urgent"]);
  const safePriority = (typeof priority === "string" && VALID_PRIORITIES.has(priority)) ? priority : "normal";

  await execute(`
    INSERT INTO AGRO_CRM_TASKS
      (TITLE, CUSTOMER_ID, DEAL_ID, ASSIGNED_TO, DUE_DATE, PRIORITY, NOTES, CREATED_BY)
    VALUES (:1, :2, :3, :4, TO_DATE(:5,'YYYY-MM-DD'), :6, :7, :8)
  `, [
    String(title),
    customer_id ? Number(customer_id) : null,
    deal_id     ? Number(deal_id)     : null,
    assigned_to ?? null,
    due_date    ?? null,
    safePriority,
    notes       ?? null,
    user.username ?? null,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
