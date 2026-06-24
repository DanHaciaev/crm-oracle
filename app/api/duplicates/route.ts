import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface DupLeadRow {
  [key: string]: unknown;
  PHONE: string; IDS: string; NAMES: string; CNT: number;
}

interface DupEmailRow {
  [key: string]: unknown;
  EMAIL: string; IDS: string; NAMES: string; CNT: number;
}

interface DupCustRow {
  [key: string]: unknown;
  CONTACT_PHONE: string; IDS: string; NAMES: string; CNT: number;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [leadsByPhone, leadsByEmail, custsByPhone] = await Promise.all([
    query<DupLeadRow>(`
      SELECT PHONE, COUNT(*) AS CNT,
        LISTAGG(CAST(ID AS VARCHAR2(20)), ',') WITHIN GROUP (ORDER BY ID) AS IDS,
        LISTAGG(NAME, ' | ')                   WITHIN GROUP (ORDER BY ID) AS NAMES
      FROM AGRO_CRM_LEADS
      WHERE PHONE IS NOT NULL AND TRIM(PHONE) != ''
      GROUP BY PHONE
      HAVING COUNT(*) > 1
      ORDER BY CNT DESC
    `, []),

    query<DupEmailRow>(`
      SELECT EMAIL, COUNT(*) AS CNT,
        LISTAGG(CAST(ID AS VARCHAR2(20)), ',') WITHIN GROUP (ORDER BY ID) AS IDS,
        LISTAGG(NAME, ' | ')                   WITHIN GROUP (ORDER BY ID) AS NAMES
      FROM AGRO_CRM_LEADS
      WHERE EMAIL IS NOT NULL AND TRIM(EMAIL) != ''
      GROUP BY EMAIL
      HAVING COUNT(*) > 1
      ORDER BY CNT DESC
    `, []),

    query<DupCustRow>(`
      SELECT CONTACT_PHONE, COUNT(*) AS CNT,
        LISTAGG(CAST(ID AS VARCHAR2(20)), ',') WITHIN GROUP (ORDER BY ID) AS IDS,
        LISTAGG(NAME, ' | ')                   WITHIN GROUP (ORDER BY ID) AS NAMES
      FROM AGRO_CUSTOMERS
      WHERE CONTACT_PHONE IS NOT NULL AND TRIM(CONTACT_PHONE) != ''
      GROUP BY CONTACT_PHONE
      HAVING COUNT(*) > 1
      ORDER BY CNT DESC
    `, []),
  ]);

  return NextResponse.json({
    leads_by_phone: leadsByPhone.map(r => ({
      type:  "lead_phone",
      value: String(r.PHONE),
      count: Number(r.CNT),
      ids:   String(r.IDS).split(",").map(Number),
      names: String(r.NAMES),
    })),
    leads_by_email: leadsByEmail.map(r => ({
      type:  "lead_email",
      value: String(r.EMAIL),
      count: Number(r.CNT),
      ids:   String(r.IDS).split(",").map(Number),
      names: String(r.NAMES),
    })),
    customers_by_phone: custsByPhone.map(r => ({
      type:  "customer_phone",
      value: String(r.CONTACT_PHONE),
      count: Number(r.CNT),
      ids:   String(r.IDS).split(",").map(Number),
      names: String(r.NAMES),
    })),
  });
}
