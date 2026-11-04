import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ClientRow {
  [key: string]: unknown;
  ID: number; CODE: string | null; NAME: string;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null; ACTIVE: string;
  STORED_KG: number; REVENUE: number; LAST_ACTIVITY: Date | string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<ClientRow>(`
    SELECT c.ID, c.CODE, c.NAME, c.CONTACT_PHONE, c.CONTACT_EMAIL, c.ACTIVE,
           NVL(b.STORED_KG, 0)      AS STORED_KG,
           NVL(r.REVENUE, 0)        AS REVENUE,
           GREATEST(NVL(b.LAST_RECEIVED, DATE '0001-01-01'), NVL(r.LAST_RELEASE, DATE '0001-01-01')) AS LAST_ACTIVITY
    FROM AGRO_STORAGE_CLIENTS c
    LEFT JOIN (
      SELECT STORAGE_CLIENT_ID,
             SUM(CASE WHEN STATUS = 'stored' THEN CURRENT_QTY_KG ELSE 0 END) AS STORED_KG,
             MAX(RECEIVED_AT) AS LAST_RECEIVED
      FROM AGRO_CUSTODY_BATCHES
      GROUP BY STORAGE_CLIENT_ID
    ) b ON b.STORAGE_CLIENT_ID = c.ID
    LEFT JOIN (
      SELECT STORAGE_CLIENT_ID, SUM(TOTAL_AMOUNT) AS REVENUE, MAX(RELEASE_DATE) AS LAST_RELEASE
      FROM AGRO_CUSTODY_RELEASES
      GROUP BY STORAGE_CLIENT_ID
    ) r ON r.STORAGE_CLIENT_ID = c.ID
    WHERE c.ACTIVE = 'Y'
    ORDER BY c.NAME
  `);

  return NextResponse.json(rows.map(r => ({
    id:             Number(r.ID),
    code:           r.CODE ?? "",
    name:           String(r.NAME),
    contact_phone:  r.CONTACT_PHONE ?? null,
    contact_email:  r.CONTACT_EMAIL ?? null,
    active:         r.ACTIVE === "Y",
    stored_kg:      Number(r.STORED_KG ?? 0),
    revenue:        Number(r.REVENUE ?? 0),
    last_activity:  r.LAST_ACTIVITY instanceof Date
                       ? (r.LAST_ACTIVITY.getFullYear() > 1 ? r.LAST_ACTIVITY.toISOString() : null)
                       : (r.LAST_ACTIVITY ?? null),
  })));
}
