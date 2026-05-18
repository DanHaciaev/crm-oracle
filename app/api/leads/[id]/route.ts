import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface LeadRow {
  [key: string]: unknown;
  ID: number; NAME: string; COMPANY: string | null;
  PHONE: string | null; EMAIL: string | null;
  SOURCE: string; STATUS: string; NOTES: string | null;
  ASSIGNED_TO: string | null; CUSTOMER_ID: number | null;
  CREATED_BY: string | null;
  CREATED_AT: Date | string | null; UPDATED_AT: Date | string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const VALID_STATUSES = new Set(["new","contacted","qualified","proposal","won","lost"]);
const VALID_SOURCES  = new Set(["web","referral","cold_call","social","exhibition","other"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const leadId = Number(id);

  const existing = await query<LeadRow>(
    `SELECT * FROM AGRO_CRM_LEADS WHERE ID = :1`, [leadId]
  );
  if (!existing.length)
    return NextResponse.json({ error: "Лид не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, company, phone, email, source, status, notes, assigned_to, customer_id } = body;

  const safeStatus = (typeof status === "string" && VALID_STATUSES.has(status))
    ? status : String(existing[0].STATUS);
  const safeSource = (typeof source === "string" && VALID_SOURCES.has(source))
    ? source : String(existing[0].SOURCE);

  await execute(`
    UPDATE AGRO_CRM_LEADS SET
      NAME        = :1,
      COMPANY     = :2,
      PHONE       = :3,
      EMAIL       = :4,
      SOURCE      = :5,
      STATUS      = :6,
      NOTES       = :7,
      ASSIGNED_TO = :8,
      CUSTOMER_ID = :9,
      UPDATED_AT  = SYSTIMESTAMP
    WHERE ID = :10
  `, [
    name        ? String(name)        : String(existing[0].NAME),
    company     !== undefined ? (company ? String(company) : null)         : existing[0].COMPANY,
    phone       !== undefined ? (phone   ? String(phone)   : null)         : existing[0].PHONE,
    email       !== undefined ? (email   ? String(email)   : null)         : existing[0].EMAIL,
    safeSource,
    safeStatus,
    notes       !== undefined ? (notes   ? String(notes)   : null)         : existing[0].NOTES,
    assigned_to !== undefined ? (assigned_to ? String(assigned_to) : null) : existing[0].ASSIGNED_TO,
    customer_id !== undefined ? (customer_id ? Number(customer_id) : null) : existing[0].CUSTOMER_ID,
    leadId,
  ]);

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  await execute(`DELETE FROM AGRO_CRM_LEADS WHERE ID = :1`, [Number(id)]);
  return NextResponse.json({ success: true });
}
