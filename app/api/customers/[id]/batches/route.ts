import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface BatchRow {
  [key: string]: unknown;
  DOC_NUMBER: string; DOC_DATE: Date | string | null;
  BATCH_NUMBER: string; ITEM_NAME: string;
  ALLOCATED_QTY_KG: number; EXPIRY_DATE: Date | string | null;
  BATCH_STATUS: string; SALES_DOC_ID: number;
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

  const rows = await query<BatchRow>(`
    SELECT sd.DOC_NUMBER, sd.DOC_DATE,
           b.BATCH_NUMBER, i.NAME_RU AS ITEM_NAME,
           NVL(ba.ALLOCATED_QTY_KG, sl.NET_WEIGHT_KG) AS ALLOCATED_QTY_KG,
           b.EXPIRY_DATE, b.STATUS AS BATCH_STATUS,
           sd.ID AS SALES_DOC_ID
    FROM AGRO_SALES_DOCS sd
    JOIN AGRO_SALES_LINES sl       ON sl.SALES_DOC_ID = sd.ID
    JOIN AGRO_ITEMS i              ON i.ID = sl.ITEM_ID
    LEFT JOIN AGRO_BATCH_ALLOCATIONS ba ON ba.SALES_LINE_ID = sl.ID
    LEFT JOIN AGRO_BATCHES b            ON b.ID = NVL(ba.BATCH_ID, sl.BATCH_ID)
    WHERE sd.CUSTOMER_ID = :1
      AND sd.STATUS IN ('confirmed','shipped','closed')
      AND b.BATCH_NUMBER IS NOT NULL
    ORDER BY sd.DOC_DATE DESC, b.EXPIRY_DATE ASC
  `, [Number(id)]);

  return NextResponse.json(rows.map(r => ({
    doc_number:    String(r.DOC_NUMBER),
    doc_date:      iso(r.DOC_DATE as Date | string | null),
    batch_number:  String(r.BATCH_NUMBER),
    item_name:     String(r.ITEM_NAME),
    qty_kg:        Number(r.ALLOCATED_QTY_KG ?? 0),
    expiry_date:   iso(r.EXPIRY_DATE as Date | string | null),
    batch_status:  String(r.BATCH_STATUS ?? ""),
    sales_doc_id:  Number(r.SALES_DOC_ID),
  })));
}
