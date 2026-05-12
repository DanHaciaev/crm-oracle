import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface EventRow {
  [key: string]: unknown;
  ID:          number;
  EVENT_TYPE:  string;
  PAYLOAD:     string | null;
  ACTOR_USER:  number | null;
  ACTOR_NAME:  string | null;
  CREATED_AT:  Date | string | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const rows = await query<EventRow>(
    `SELECT e.ID, e.EVENT_TYPE, e.PAYLOAD, e.ACTOR_USER,
            au.USERNAME AS ACTOR_NAME, e.CREATED_AT
       FROM CRM_APP_USER_EVENTS e
       LEFT JOIN AGRO_USERS au ON au.ID = e.ACTOR_USER
      WHERE e.APP_USER_ID = :1
      ORDER BY e.CREATED_AT DESC, e.ID DESC`,
    [appUserId]
  );

  return NextResponse.json(rows.map((r) => ({
    id:         r.ID,
    event_type: r.EVENT_TYPE,
    payload:    r.PAYLOAD,
    actor_id:   r.ACTOR_USER,
    actor_name: r.ACTOR_NAME,
    created_at: iso(r.CREATED_AT),
  })));
}
