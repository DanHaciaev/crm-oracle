import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/oracle";

interface Row extends Record<string, unknown> {
  ID: number; CODE: string; NAME: string;
  COUNTRY: string | null; CUSTOMER_TYPE: string | null;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null;
  ACTIVE: string;
  DEAL_COUNT: number; WON_SUM: number;
  IN_PRODUCTION: number; LAST_ACTIVITY: Date | string | null;
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const q           = (sp.get("q") ?? "").trim();
  const type        = sp.get("type") ?? "all";      // all | domestic | export
  const onlyDeals   = sp.get("only_deals") === "1";
  const inProd      = sp.get("in_prod") === "1";

  const binds: (string | number)[] = [];
  const conditions: string[] = [];

  if (q) {
    binds.push(`%${q.toUpperCase()}%`, `%${q}%`, `%${q.toUpperCase()}%`);
    conditions.push(
      `(UPPER(c.NAME) LIKE :${binds.length - 2} OR c.CONTACT_PHONE LIKE :${binds.length - 1} OR UPPER(c.CONTACT_EMAIL) LIKE :${binds.length})`
    );
  }
  if (type !== "all") {
    binds.push(type);
    conditions.push(`c.CUSTOMER_TYPE = :${binds.length}`);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT
        c.ID, c.CODE, c.NAME, c.COUNTRY, c.CUSTOMER_TYPE,
        c.CONTACT_PHONE, c.CONTACT_EMAIL, c.ACTIVE,
        NVL(d.DEAL_COUNT,    0) AS DEAL_COUNT,
        NVL(d.WON_SUM,       0) AS WON_SUM,
        NVL(d.IN_PRODUCTION, 0) AS IN_PRODUCTION,
        d.LAST_ACTIVITY
      FROM AGRO_CUSTOMERS c
      LEFT JOIN (
        SELECT
          CUSTOMER_ID,
          COUNT(*)                                                                              AS DEAL_COUNT,
          SUM(CASE WHEN STATUS = 'closed' THEN NVL(TOTAL_AMOUNT_MDL, NVL(TOTAL_AMOUNT, 0)) ELSE 0 END) AS WON_SUM,
          SUM(CASE WHEN STATUS IN ('confirmed','shipped') THEN 1 ELSE 0 END)                   AS IN_PRODUCTION,
          MAX(DOC_DATE)                                                                         AS LAST_ACTIVITY
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
        GROUP BY CUSTOMER_ID
      ) d ON d.CUSTOMER_ID = c.ID
      ${where}
      ORDER BY d.LAST_ACTIVITY DESC NULLS LAST, c.NAME
    ) WHERE ROWNUM <= 500
  `, binds);

  let result = rows;
  if (onlyDeals) result = result.filter(r => Number(r.DEAL_COUNT) > 0);
  if (inProd)    result = result.filter(r => Number(r.IN_PRODUCTION) > 0);

  return NextResponse.json(
    result.map(r => ({
      id:            r.ID,
      code:          r.CODE,
      name:          r.NAME,
      country:       r.COUNTRY,
      customer_type: r.CUSTOMER_TYPE,
      contact_phone: r.CONTACT_PHONE,
      contact_email: r.CONTACT_EMAIL,
      active:        r.ACTIVE === "Y",
      deal_count:    Number(r.DEAL_COUNT ?? 0),
      won_sum:       Number(r.WON_SUM    ?? 0),
      in_production: Number(r.IN_PRODUCTION ?? 0),
      last_activity: r.LAST_ACTIVITY instanceof Date
        ? r.LAST_ACTIVITY.toISOString()
        : (r.LAST_ACTIVITY ?? null),
    })),
    { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=15" } }
  );
}
