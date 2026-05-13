import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ItemRow {
  [key: string]: unknown;
  ID:                number;
  NAME_RU:           string | null;
  NAME_RO:           string | null;
  ITEM_GROUP:        string | null;
  UNIT:              string | null;
  DEFAULT_TARE_KG:   number | null;
  SHELF_LIFE_DAYS:   number | null;
  OPTIMAL_TEMP_MIN:  number | null;
  OPTIMAL_TEMP_MAX:  number | null;
  TOTAL_REV:         number | null;
  TOTAL_NET_KG:      number | null;
  ORDERS_COUNT:      number | null;
  LAST_SALE_DATE:    Date | string | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const rows = await query<ItemRow>(`
    SELECT
      i.ID,
      i.NAME_RU,
      i.NAME_RO,
      i.ITEM_GROUP,
      i.UNIT,
      i.DEFAULT_TARE_KG,
      i.SHELF_LIFE_DAYS,
      i.OPTIMAL_TEMP_MIN,
      i.OPTIMAL_TEMP_MAX,
      NVL(SUM(sl.AMOUNT),    0)                                        AS TOTAL_REV,
      NVL(SUM(sl.NET_WEIGHT_KG), 0)                                    AS TOTAL_NET_KG,
      COUNT(DISTINCT sl.SALES_DOC_ID)                                  AS ORDERS_COUNT,
      MAX(sd.DOC_DATE)                                                  AS LAST_SALE_DATE
    FROM AGRO_ITEMS i
    LEFT JOIN AGRO_SALES_LINES sl ON sl.ITEM_ID = i.ID
    LEFT JOIN AGRO_SALES_DOCS  sd ON sd.ID = sl.SALES_DOC_ID
                                  AND sd.STATUS NOT IN ('draft','cancelled')
    GROUP BY
      i.ID, i.NAME_RU, i.NAME_RO, i.ITEM_GROUP,
      i.UNIT, i.DEFAULT_TARE_KG, i.SHELF_LIFE_DAYS,
      i.OPTIMAL_TEMP_MIN, i.OPTIMAL_TEMP_MAX
    ORDER BY i.NAME_RU
  `);

  return NextResponse.json(rows.map((r) => ({
    id:               r.ID,
    name_ru:          r.NAME_RU ?? "",
    name_ro:          r.NAME_RO ?? "",
    item_group:       r.ITEM_GROUP ?? "",
    unit:             r.UNIT ?? "",
    default_tare_kg:  r.DEFAULT_TARE_KG !== null ? Number(r.DEFAULT_TARE_KG) : null,
    shelf_life_days:  r.SHELF_LIFE_DAYS !== null ? Number(r.SHELF_LIFE_DAYS) : null,
    optimal_temp_min: r.OPTIMAL_TEMP_MIN !== null ? Number(r.OPTIMAL_TEMP_MIN) : null,
    optimal_temp_max: r.OPTIMAL_TEMP_MAX !== null ? Number(r.OPTIMAL_TEMP_MAX) : null,
    total_revenue:    Number(r.TOTAL_REV    ?? 0),
    total_net_kg:     Number(r.TOTAL_NET_KG ?? 0),
    orders_count:     Number(r.ORDERS_COUNT ?? 0),
    last_sale_date:   r.LAST_SALE_DATE instanceof Date
                        ? r.LAST_SALE_DATE.toISOString()
                        : (r.LAST_SALE_DATE ?? null),
  })));
}
