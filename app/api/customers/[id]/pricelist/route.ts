import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

type Row = Record<string, unknown>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const rows = await query<Row>(`
    SELECT
      i.ID                              AS ITEM_ID,
      NVL(i.NAME_RU, i.NAME_RO)        AS ITEM_NAME,
      NVL(i.UNIT, 'кг')                AS UNIT,
      ROUND(MIN(sl.PRICE_PER_KG), 2)   AS MIN_PRICE,
      ROUND(MAX(sl.PRICE_PER_KG), 2)   AS MAX_PRICE,
      ROUND(AVG(sl.PRICE_PER_KG), 2)   AS AVG_PRICE,
      ROUND(SUM(sl.NET_WEIGHT_KG), 2)  AS TOTAL_KG,
      COUNT(DISTINCT sd.ID)             AS ORDERS,
      MAX(sd.DOC_DATE)                  AS LAST_DATE
    FROM AGRO_SALES_LINES sl
    JOIN AGRO_ITEMS i      ON i.ID  = sl.ITEM_ID
    JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
    WHERE sd.CUSTOMER_ID = :1
      AND sd.STATUS NOT IN ('draft', 'cancelled')
      AND sl.PRICE_PER_KG > 0
    GROUP BY i.ID, i.NAME_RU, i.NAME_RO, i.UNIT
    ORDER BY SUM(sl.NET_WEIGHT_KG) DESC
  `, [customerId]);

  return NextResponse.json(rows.map(r => ({
    item_id:    Number(r.ITEM_ID),
    item_name:  String(r.ITEM_NAME ?? ""),
    unit:       String(r.UNIT ?? "кг"),
    min_price:  Number(r.MIN_PRICE),
    max_price:  Number(r.MAX_PRICE),
    avg_price:  Number(r.AVG_PRICE),
    total_kg:   Number(r.TOTAL_KG),
    orders:     Number(r.ORDERS),
    last_date:  r.LAST_DATE instanceof Date ? r.LAST_DATE.toISOString() : String(r.LAST_DATE ?? ""),
  })));
}
