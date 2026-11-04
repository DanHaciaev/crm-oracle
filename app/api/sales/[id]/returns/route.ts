import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ReturnRow {
  [key: string]: unknown;
  ID:            number;
  RETURN_NUMBER: string;
  RETURN_DATE:   Date | string | null;
  REASON:        string | null;
  CREATED_BY:    string | null;
  TOTAL_QTY_KG:  number | null;
  TOTAL_AMOUNT:  number | null;
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
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const rows = await query<ReturnRow>(`
    SELECT r.ID, r.RETURN_NUMBER, r.RETURN_DATE, r.REASON, r.CREATED_BY,
           NVL(l.TOTAL_QTY_KG, 0) AS TOTAL_QTY_KG,
           NVL(l.TOTAL_AMOUNT, 0) AS TOTAL_AMOUNT
    FROM AGRO_SALES_RETURNS r
    LEFT JOIN (
      SELECT RETURN_ID, SUM(QTY_KG) AS TOTAL_QTY_KG, SUM(AMOUNT) AS TOTAL_AMOUNT
      FROM AGRO_SALES_RETURN_LINES
      GROUP BY RETURN_ID
    ) l ON l.RETURN_ID = r.ID
    WHERE r.SALES_DOC_ID = :1
    ORDER BY r.RETURN_DATE DESC
  `, [docId]);

  return NextResponse.json(rows.map(r => ({
    id:            Number(r.ID),
    return_number: String(r.RETURN_NUMBER),
    return_date:   iso(r.RETURN_DATE as Date | string | null),
    reason:        r.REASON ?? null,
    created_by:    r.CREATED_BY ?? null,
    qty_kg:        Number(r.TOTAL_QTY_KG ?? 0),
    amount:        Number(r.TOTAL_AMOUNT ?? 0),
  })));
}
