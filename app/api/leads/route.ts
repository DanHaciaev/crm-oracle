import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (LOSS_REASON VARCHAR2(500))'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (EXPECTED_CLOSE DATE)'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (PIPELINE_ID NUMBER)'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  columnsReady = true;
}

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

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

function mapLead(r: LeadRow) {
  return {
    id:             Number(r.ID),
    name:           String(r.NAME),
    company:        r.COMPANY        ? String(r.COMPANY)        : null,
    phone:          r.PHONE          ? String(r.PHONE)          : null,
    email:          r.EMAIL          ? String(r.EMAIL)          : null,
    source:         String(r.SOURCE ?? "other"),
    status:         String(r.STATUS ?? "new"),
    notes:          r.NOTES          ? String(r.NOTES)          : null,
    assigned_to:    r.ASSIGNED_TO    ? String(r.ASSIGNED_TO)    : null,
    customer_id:    r.CUSTOMER_ID    ? Number(r.CUSTOMER_ID)    : null,
    created_by:     r.CREATED_BY     ? String(r.CREATED_BY)     : null,
    created_at:     iso(r.CREATED_AT as Date | string | null),
    updated_at:     iso(r.UPDATED_AT as Date | string | null),
    loss_reason:    r.LOSS_REASON    ? String(r.LOSS_REASON)    : null,
    expected_close: iso(r.EXPECTED_CLOSE as Date | string | null),
    pipeline_id:    r.PIPELINE_ID    ? Number(r.PIPELINE_ID)    : null,
  };
}

const VALID_STATUSES = new Set(["new","contacted","qualified","proposal","won","lost"]);
const VALID_SOURCES  = new Set(["web","referral","cold_call","social","exhibition","other"]);

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureColumns();

  const sp          = req.nextUrl.searchParams;
  const status      = sp.get("status");
  const search      = sp.get("search");
  const pipelineId  = sp.get("pipeline_id");

  const statusCond = status && VALID_STATUSES.has(status)
    ? `AND l.STATUS = '${status}'` : "";
  const searchCond = search
    ? `AND (UPPER(l.NAME) LIKE UPPER('%${search.replace(/'/g, "''")}%') OR UPPER(l.COMPANY) LIKE UPPER('%${search.replace(/'/g, "''")}%'))`
    : "";
  const pipelineCond = pipelineId && /^\d+$/.test(pipelineId)
    ? `AND l.PIPELINE_ID = ${pipelineId}` : "";

  const rows = await query<LeadRow>(`
    SELECT * FROM (
      SELECT
        l.ID, l.NAME, l.COMPANY, l.PHONE, l.EMAIL,
        l.SOURCE, l.STATUS, l.NOTES, l.ASSIGNED_TO,
        l.CUSTOMER_ID, l.CREATED_BY, l.CREATED_AT, l.UPDATED_AT,
        l.LOSS_REASON, l.EXPECTED_CLOSE, l.PIPELINE_ID
      FROM AGRO_CRM_LEADS l
      WHERE 1=1 ${statusCond} ${searchCond} ${pipelineCond}
      ORDER BY l.CREATED_AT DESC
    ) WHERE ROWNUM <= 200
  `, []);

  return NextResponse.json(rows.map(mapLead));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, company, phone, email, source, notes, assigned_to, pipeline_id } = body;

  if (!name) return NextResponse.json({ error: "name обязателен" }, { status: 400 });

  const safeSource = (typeof source === "string" && VALID_SOURCES.has(source)) ? source : "other";
  const safePipelineId = pipeline_id ? Number(pipeline_id) : null;

  await execute(`
    INSERT INTO AGRO_CRM_LEADS
      (NAME, COMPANY, PHONE, EMAIL, SOURCE, NOTES, ASSIGNED_TO, CREATED_BY, PIPELINE_ID)
    VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9)
  `, [
    String(name),
    company     ? String(company)     : null,
    phone       ? String(phone)       : null,
    email       ? String(email)       : null,
    safeSource,
    notes       ? String(notes)       : null,
    assigned_to ? String(assigned_to) : null,
    user.username,
    safePipelineId,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
