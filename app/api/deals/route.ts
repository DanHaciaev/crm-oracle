import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface DealRow {
  [key: string]: unknown;
  ID: number; TITLE: string; CUSTOMER_ID: number; CUSTOMER_NAME: string | null;
  STAGE: string; AMOUNT: number | null; CURRENCY: string; PROBABILITY: number;
  EXPECTED_DATE: Date | string | null; ASSIGNED_TO: string | null;
  NOTES: string | null; CREATED_BY: string | null;
  CREATED_AT: Date | string | null; UPDATED_AT: Date | string | null;
  CLOSED_AT: Date | string | null;
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

function mapDeal(r: DealRow) {
  return {
    id:            r.ID,
    title:         r.TITLE,
    customer_id:   r.CUSTOMER_ID,
    customer_name: r.CUSTOMER_NAME ?? "",
    stage:         r.STAGE,
    amount:        r.AMOUNT !== null ? Number(r.AMOUNT) : null,
    currency:      r.CURRENCY,
    probability:   Number(r.PROBABILITY ?? 0),
    expected_date: iso(r.EXPECTED_DATE),
    assigned_to:   r.ASSIGNED_TO ?? null,
    notes:         r.NOTES ?? "",
    created_by:    r.CREATED_BY ?? null,
    created_at:    iso(r.CREATED_AT),
    updated_at:    iso(r.UPDATED_AT),
    closed_at:     iso(r.CLOSED_AT),
  };
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const stage      = sp.get("stage");
  const customerId = sp.get("customer_id");

  const VALID_STAGES = new Set(["lead","qualified","proposal","negotiation","won","lost"]);
  const stageCond  = stage && VALID_STAGES.has(stage) ? `AND d.STAGE = '${stage}'` : "";
  const custCond   = customerId ? `AND d.CUSTOMER_ID = ${Number(customerId)}` : "";

  const rows = await query<DealRow>(`
    SELECT d.ID, d.TITLE, d.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
           d.STAGE, d.AMOUNT, d.CURRENCY, d.PROBABILITY,
           d.EXPECTED_DATE, d.ASSIGNED_TO, d.NOTES, d.CREATED_BY,
           d.CREATED_AT, d.UPDATED_AT, d.CLOSED_AT
    FROM AGRO_CRM_DEALS d
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = d.CUSTOMER_ID
    WHERE 1=1 ${stageCond} ${custCond}
    ORDER BY d.UPDATED_AT DESC
  `, []);

  return NextResponse.json(rows.map(mapDeal));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { title, customer_id, stage, amount, currency, probability, expected_date, assigned_to, notes } = body;

  if (!title || !customer_id) {
    return NextResponse.json({ error: "title и customer_id обязательны" }, { status: 400 });
  }

  const VALID_STAGES = new Set(["lead","qualified","proposal","negotiation","won","lost"]);
  const safeStage = (typeof stage === "string" && VALID_STAGES.has(stage)) ? stage : "lead";

  await execute(`
    INSERT INTO AGRO_CRM_DEALS
      (TITLE, CUSTOMER_ID, STAGE, AMOUNT, CURRENCY, PROBABILITY, EXPECTED_DATE, ASSIGNED_TO, NOTES, CREATED_BY)
    VALUES (:1, :2, :3, :4, :5, :6, TO_DATE(:7,'YYYY-MM-DD'), :8, :9, :10)
  `, [
    String(title),
    Number(customer_id),
    safeStage,
    amount !== undefined && amount !== null && amount !== "" ? Number(amount) : null,
    currency ?? "MDL",
    probability !== undefined ? Number(probability) : 10,
    expected_date ?? null,
    assigned_to ?? null,
    notes ?? null,
    user.username ?? null,
  ]);

  const rows = await query<DealRow>(`
    SELECT d.*, c.NAME AS CUSTOMER_NAME FROM AGRO_CRM_DEALS d
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = d.CUSTOMER_ID
    WHERE d.ID = (SELECT MAX(ID) FROM AGRO_CRM_DEALS WHERE CREATED_BY = :1)
  `, [user.username ?? null]);

  return NextResponse.json(rows[0] ? mapDeal(rows[0]) : { success: true }, { status: 201 });
}
