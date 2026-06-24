import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface BatchRow {
  [key: string]: unknown;
  BATCH_ID: number; BATCH_NUMBER: string; ITEM_ID: number;
  ITEM_NAME: string; CURRENT_QTY_KG: number;
  EXPIRY_DATE: Date | string; DAYS_LEFT: number;
}
interface CustRow {
  [key: string]: unknown;
  ITEM_ID: number; CUST_ID: number; CUST_NAME: string; DEAL_COUNT: number;
}

export async function GET() {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const batches = await query<BatchRow>(`
    SELECT b.ID AS BATCH_ID, b.BATCH_NUMBER, b.ITEM_ID,
           i.NAME_RU AS ITEM_NAME,
           b.CURRENT_QTY_KG,
           b.EXPIRY_DATE,
           TRUNC(b.EXPIRY_DATE) - TRUNC(SYSDATE) AS DAYS_LEFT
    FROM AGRO_BATCHES b
    JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
    WHERE b.STATUS = 'active'
      AND b.CURRENT_QTY_KG > 0
      AND b.EXPIRY_DATE IS NOT NULL
      AND b.EXPIRY_DATE <= SYSDATE + 14
    ORDER BY b.EXPIRY_DATE ASC
  `, []);

  if (!batches.length) return NextResponse.json([]);

  const itemIds = [...new Set(batches.map(b => Number(b.ITEM_ID)))];
  const placeholders = itemIds.map((_, i) => `:${i + 1}`).join(",");

  const customers = await query<CustRow>(`
    SELECT sl.ITEM_ID, c.ID AS CUST_ID, c.NAME AS CUST_NAME, COUNT(*) AS DEAL_COUNT
    FROM AGRO_SALES_LINES sl
    JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
    JOIN AGRO_CUSTOMERS c   ON c.ID  = sd.CUSTOMER_ID
    WHERE sl.ITEM_ID IN (${placeholders})
      AND sd.STATUS IN ('confirmed','shipped','closed')
      AND sd.DOC_DATE >= ADD_MONTHS(SYSDATE, -12)
    GROUP BY sl.ITEM_ID, c.ID, c.NAME
    ORDER BY COUNT(*) DESC
  `, itemIds);

  const custByItem: Record<number, { id: number; name: string }[]> = {};
  for (const r of customers) {
    const key = Number(r.ITEM_ID);
    if (!custByItem[key]) custByItem[key] = [];
    if (custByItem[key].length < 3)
      custByItem[key].push({ id: Number(r.CUST_ID), name: String(r.CUST_NAME) });
  }

  return NextResponse.json(batches.map(b => ({
    batch_id:       Number(b.BATCH_ID),
    batch_number:   String(b.BATCH_NUMBER),
    item_name:      String(b.ITEM_NAME),
    qty_kg:         Number(b.CURRENT_QTY_KG),
    expiry_date:    b.EXPIRY_DATE instanceof Date ? b.EXPIRY_DATE.toISOString() : String(b.EXPIRY_DATE),
    days_left:      Number(b.DAYS_LEFT),
    top_customers:  custByItem[Number(b.ITEM_ID)] ?? [],
  })));
}
