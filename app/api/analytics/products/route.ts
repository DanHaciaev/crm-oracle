import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface TopRow {
  [key: string]: unknown;
  ITEM_ID:        number;
  ITEM_NAME:      string;
  TOTAL_KG:       number;
  TOTAL_MDL:      number;
  DOC_COUNT:      number;
  AVG_SALE_PRICE: number | null;
  AVG_COST_PRICE: number | null;
}

interface MonthRow {
  [key: string]: unknown;
  ITEM_ID:      number;
  ITEM_NAME:    string;
  MON:          string;
  KG:           number;
  MDL:          number;
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const months = Math.min(Number(searchParams.get("months") ?? "12"), 24);
  const topN   = Math.min(Number(searchParams.get("top") ?? "10"), 20);

  const topRows = await query<TopRow>(`
    SELECT * FROM (
      SELECT i.ID AS ITEM_ID,
             i.NAME_RU AS ITEM_NAME,
             ROUND(SUM(sl.NET_WEIGHT_KG), 1)    AS TOTAL_KG,
             ROUND(SUM(sl.AMOUNT_MDL), 0)        AS TOTAL_MDL,
             COUNT(DISTINCT sl.SALES_DOC_ID)     AS DOC_COUNT,
             ROUND(AVG(sl.PRICE_PER_KG_MDL), 4)  AS AVG_SALE_PRICE,
             (SELECT ROUND(AVG(pl.PRICE_PER_KG_MDL), 4)
              FROM AGRO_PURCHASE_LINES pl
              WHERE pl.ITEM_ID = i.ID
                AND pl.PRICE_PER_KG_MDL IS NOT NULL) AS AVG_COST_PRICE
      FROM AGRO_SALES_LINES sl
      JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
      JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
      WHERE sd.DOC_DATE >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -:1)
        AND sd.STATUS   != 'cancelled'
      GROUP BY i.ID, i.NAME_RU
      ORDER BY SUM(sl.NET_WEIGHT_KG) DESC
    ) WHERE ROWNUM <= ${topN}
  `, [months]);

  if (topRows.length === 0)
    return NextResponse.json({ top: [], monthly: [] });

  const topIds = topRows.map(r => r.ITEM_ID);
  const inList = topIds.map((_, idx) => `:${idx + 3}`).join(",");

  const monthRows = await query<MonthRow>(`
    SELECT i.ID AS ITEM_ID,
           i.NAME_RU AS ITEM_NAME,
           TO_CHAR(sd.DOC_DATE, 'YYYY-MM') AS MON,
           ROUND(SUM(sl.NET_WEIGHT_KG), 1) AS KG,
           ROUND(SUM(sl.AMOUNT_MDL), 0)    AS MDL
    FROM AGRO_SALES_LINES sl
    JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
    JOIN AGRO_SALES_DOCS sd ON sd.ID = sl.SALES_DOC_ID
    WHERE sd.DOC_DATE >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -:1)
      AND sd.STATUS != 'cancelled'
      AND i.ID IN (${inList})
    GROUP BY i.ID, i.NAME_RU, TO_CHAR(sd.DOC_DATE, 'YYYY-MM')
    ORDER BY MON, i.NAME_RU
  `, [months, ...topIds]);

  return NextResponse.json({
    top: topRows.map(r => {
      const sale = r.AVG_SALE_PRICE != null ? Number(r.AVG_SALE_PRICE) : null;
      const cost = r.AVG_COST_PRICE != null ? Number(r.AVG_COST_PRICE) : null;
      const margin = sale && cost && sale > 0 ? Math.round((sale - cost) / sale * 100) : null;
      return {
        item_id:        r.ITEM_ID,
        item_name:      r.ITEM_NAME,
        total_kg:       Number(r.TOTAL_KG),
        total_mdl:      Number(r.TOTAL_MDL),
        doc_count:      Number(r.DOC_COUNT),
        avg_sale_price: sale,
        avg_cost_price: cost,
        margin_pct:     margin,
      };
    }),
    monthly: monthRows.map(r => ({
      item_id:   r.ITEM_ID,
      item_name: r.ITEM_NAME,
      mon:       r.MON,
      kg:        Number(r.KG),
      mdl:       Number(r.MDL),
    })),
  });
}
