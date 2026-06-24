import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute, getConnection } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import oracledb from "oracledb";

interface LeadRow {
  [key: string]: unknown;
  ID: number; NAME: string; COMPANY: string | null;
  PHONE: string | null; EMAIL: string | null;
  SOURCE: string; STATUS: string; NOTES: string | null;
  ASSIGNED_TO: string | null; CUSTOMER_ID: number | null;
  CREATED_BY: string | null;
  CREATED_AT: Date | string | null; UPDATED_AT: Date | string | null;
  LOSS_REASON: string | null;
  EXPECTED_CLOSE: Date | string | null;
  PIPELINE_ID: number | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

async function ensureColumns() {
  const conn = await getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (LOSS_REASON VARCHAR2(500))';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    `, [], { autoCommit: true });
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (EXPECTED_CLOSE DATE)';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    `, [], { autoCommit: true });
  } finally {
    await conn.close();
  }
}

const VALID_STATUSES = new Set(["new","contacted","qualified","proposal","won","lost"]);
const VALID_SOURCES  = new Set(["web","referral","cold_call","social","exhibition","other"]);
const VALID_LOSS_REASONS = new Set(["price","competitor","no_budget","no_contact","timing","other"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureColumns();

  const { id } = await params;
  const leadId = Number(id);

  const existing = await query<LeadRow>(
    `SELECT * FROM AGRO_CRM_LEADS WHERE ID = :1`, [leadId]
  );
  if (!existing.length)
    return NextResponse.json({ error: "Лид не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, company, phone, email, source, status, notes, assigned_to, customer_id, loss_reason, expected_close, pipeline_id } = body;

  const safeStatus = (typeof status === "string" && VALID_STATUSES.has(status))
    ? status : String(existing[0].STATUS);
  const safeSource = (typeof source === "string" && VALID_SOURCES.has(source))
    ? source : String(existing[0].SOURCE);

  const safeLossReason = loss_reason !== undefined
    ? (typeof loss_reason === "string" && VALID_LOSS_REASONS.has(loss_reason) ? loss_reason : null)
    : (existing[0].LOSS_REASON ? String(existing[0].LOSS_REASON) : null);

  // Parse expected_close date
  let safeExpectedClose: Date | null = null;
  if (expected_close !== undefined) {
    safeExpectedClose = expected_close ? new Date(String(expected_close)) : null;
  } else if (existing[0].EXPECTED_CLOSE) {
    safeExpectedClose = existing[0].EXPECTED_CLOSE instanceof Date
      ? existing[0].EXPECTED_CLOSE
      : new Date(String(existing[0].EXPECTED_CLOSE));
  }

  const conn = await getConnection();
  try {
    const safePipelineId = pipeline_id !== undefined
      ? (pipeline_id ? Number(pipeline_id) : null)
      : (existing[0].PIPELINE_ID ? Number(existing[0].PIPELINE_ID) : null);

    await conn.execute(`
      UPDATE AGRO_CRM_LEADS SET
        NAME           = :1,
        COMPANY        = :2,
        PHONE          = :3,
        EMAIL          = :4,
        SOURCE         = :5,
        STATUS         = :6,
        NOTES          = :7,
        ASSIGNED_TO    = :8,
        CUSTOMER_ID    = :9,
        LOSS_REASON    = :10,
        EXPECTED_CLOSE = :11,
        PIPELINE_ID    = :12,
        UPDATED_AT     = SYSTIMESTAMP
      WHERE ID = :13
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
      safeLossReason,
      safeExpectedClose,
      safePipelineId,
      leadId,
    ], { autoCommit: true });
  } finally {
    await conn.close();
  }

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
