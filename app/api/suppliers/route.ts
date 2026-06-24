import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface SupplierRow {
  [key: string]: unknown;
  ID: number; CODE: string; NAME: string;
  COUNTRY: string | null; CONTACT_PHONE: string | null;
  CONTACT_EMAIL: string | null; ACTIVE: string;
  TOTAL_PURCHASES: number; LAST_PURCHASE: Date | string | null;
  PURCHASE_COUNT: number;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<SupplierRow>(`
    SELECT s.ID, s.CODE, s.NAME, s.COUNTRY, s.CONTACT_PHONE, s.CONTACT_EMAIL, s.ACTIVE,
           NVL(st.TOTAL_PURCHASES, 0) AS TOTAL_PURCHASES,
           st.LAST_PURCHASE,
           NVL(st.PURCHASE_COUNT, 0) AS PURCHASE_COUNT
    FROM AGRO_SUPPLIERS s
    LEFT JOIN (
      SELECT SUPPLIER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) AS TOTAL_PURCHASES,
             MAX(DOC_DATE)                             AS LAST_PURCHASE,
             COUNT(*)                                  AS PURCHASE_COUNT
      FROM AGRO_PURCHASE_DOCS
      WHERE STATUS != 'cancelled'
      GROUP BY SUPPLIER_ID
    ) st ON st.SUPPLIER_ID = s.ID
    WHERE s.ACTIVE = 'Y'
    ORDER BY s.NAME
  `, []);

  return NextResponse.json(rows.map(r => ({
    id:             Number(r.ID),
    code:           String(r.CODE),
    name:           String(r.NAME),
    country:        r.COUNTRY        ?? null,
    contact_phone:  r.CONTACT_PHONE  ?? null,
    contact_email:  r.CONTACT_EMAIL  ?? null,
    active:         r.ACTIVE === "Y",
    total_purchases: Number(r.TOTAL_PURCHASES ?? 0),
    last_purchase:  r.LAST_PURCHASE instanceof Date
                      ? r.LAST_PURCHASE.toISOString()
                      : (r.LAST_PURCHASE ?? null),
    purchase_count: Number(r.PURCHASE_COUNT ?? 0),
  })));
}
