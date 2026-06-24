import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface SupplierRow {
  [key: string]: unknown;
  ID: number; CODE: string; NAME: string;
  COUNTRY: string | null; TAX_ID: string | null;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null;
  ADDRESS: string | null; ACTIVE: string;
}
interface PurchaseRow {
  [key: string]: unknown;
  ID: number; DOC_NUMBER: string; DOC_DATE: Date | string | null;
  STATUS: string; TOTAL_GROSS_KG: number | null; TOTAL_NET_KG: number | null;
  TOTAL_AMOUNT: number | null; CURRENCY_CODE: string | null;
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;

  const [suppliers, purchases] = await Promise.all([
    query<SupplierRow>(`
      SELECT ID, CODE, NAME, COUNTRY, TAX_ID, CONTACT_PHONE, CONTACT_EMAIL, ADDRESS, ACTIVE
      FROM AGRO_SUPPLIERS WHERE ID = :1
    `, [Number(id)]),

    query<PurchaseRow>(`
      SELECT pd.ID, pd.DOC_NUMBER, pd.DOC_DATE, pd.STATUS,
             pd.TOTAL_GROSS_KG, pd.TOTAL_NET_KG, pd.TOTAL_AMOUNT,
             cur.CODE AS CURRENCY_CODE
      FROM AGRO_PURCHASE_DOCS pd
      LEFT JOIN AGRO_CURRENCIES cur ON cur.ID = pd.CURRENCY_ID
      WHERE pd.SUPPLIER_ID = :1
      ORDER BY pd.DOC_DATE DESC
    `, [Number(id)]),
  ]);

  if (!suppliers.length)
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const s = suppliers[0];
  return NextResponse.json({
    supplier: {
      id:            Number(s.ID),
      code:          String(s.CODE),
      name:          String(s.NAME),
      country:       s.COUNTRY       ?? null,
      tax_id:        s.TAX_ID        ?? null,
      contact_phone: s.CONTACT_PHONE ?? null,
      contact_email: s.CONTACT_EMAIL ?? null,
      address:       s.ADDRESS       ?? null,
      active:        s.ACTIVE === "Y",
    },
    purchases: purchases.map(p => ({
      id:          Number(p.ID),
      doc_number:  String(p.DOC_NUMBER),
      doc_date:    iso(p.DOC_DATE as Date | string | null),
      status:      String(p.STATUS),
      gross_kg:    Number(p.TOTAL_GROSS_KG ?? 0),
      net_kg:      Number(p.TOTAL_NET_KG   ?? 0),
      amount:      Number(p.TOTAL_AMOUNT   ?? 0),
      currency:    String(p.CURRENCY_CODE  ?? "MDL"),
    })),
  });
}
