import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface SegRow {
  [key: string]: unknown;
  ID: number; CODE: string; NAME: string; COUNTRY: string | null;
  CUSTOMER_TYPE: string | null; CONTACT_PHONE: string | null;
  ACTIVE: string; SEGMENT: string;
  TOTAL_REVENUE: number | null; TOTAL_REVENUE_ORIG: number | null;
  CURRENCY_CODE: string | null;
  LAST_ORDER_DATE: Date | string | null;
  ORDER_COUNT: number | null; TG_LINKED: number;
  RFM_R: number | null;
  RFM_F: number | null;
  RFM_M: number | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<SegRow>(`
    SELECT
      c.ID, c.CODE, c.NAME, c.COUNTRY, c.CUSTOMER_TYPE, c.CONTACT_PHONE, c.ACTIVE,
      NVL(s.TOTAL_REV, 0)      AS TOTAL_REVENUE,
      s.TOTAL_REV_ORIG         AS TOTAL_REVENUE_ORIG,
      s.DOMINANT_CURRENCY      AS CURRENCY_CODE,
      s.LAST_DATE              AS LAST_ORDER_DATE,
      NVL(s.ORD_CNT, 0)       AS ORDER_COUNT,
      CASE WHEN au.ID IS NOT NULL THEN 1 ELSE 0 END AS TG_LINKED,
      CASE
        WHEN s.FIRST_DATE >= SYSDATE - 30 AND NVL(s.ORD_CNT, 0) <= 3 THEN 'new'
        WHEN NVL(s90.REV90, 0) >= 50000                              THEN 'vip'
        WHEN s.LAST_DATE >= SYSDATE - 60                             THEN 'active'
        WHEN s.LAST_DATE >= SYSDATE - 180                            THEN 'sleeping'
        WHEN s.ORD_CNT > 0                                           THEN 'churned'
        ELSE 'no_orders'
      END AS SEGMENT,
      CASE WHEN s.LAST_DATE IS NOT NULL
           THEN ROUND(SYSDATE - s.LAST_DATE) END     AS RFM_R,
      NVL(s90.CNT90, 0)                              AS RFM_F,
      NVL(s90.REV90, 0)                              AS RFM_M
    FROM AGRO_CUSTOMERS c
    LEFT JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT))                        TOTAL_REV,
             CASE WHEN COUNT(DISTINCT NVL(CURRENCY_CODE,'MDL')) = 1
                  THEN SUM(TOTAL_AMOUNT) END                                  TOTAL_REV_ORIG,
             MAX(NVL(CURRENCY_CODE,'MDL')) KEEP (DENSE_RANK LAST ORDER BY DOC_DATE) DOMINANT_CURRENCY,
             COUNT(*)          ORD_CNT,
             MAX(DOC_DATE)     LAST_DATE,
             MIN(DOC_DATE)     FIRST_DATE
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) s ON c.ID = s.CUSTOMER_ID
    LEFT JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) REV90,
             COUNT(*)                                  CNT90
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
        AND DOC_DATE >= SYSDATE - 90
      GROUP BY CUSTOMER_ID
    ) s90 ON c.ID = s90.CUSTOMER_ID
    LEFT JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'
    WHERE c.ACTIVE = 'Y'
    ORDER BY NVL(s.TOTAL_REV, 0) DESC
  `, []);

  return NextResponse.json(rows.map((r) => ({
    id:             r.ID,
    code:           r.CODE,
    name:           r.NAME,
    country:        r.COUNTRY ?? null,
    customer_type:  r.CUSTOMER_TYPE ?? null,
    contact_phone:  r.CONTACT_PHONE ?? null,
    segment:        r.SEGMENT,
    total_revenue:      Number(r.TOTAL_REVENUE ?? 0),
    total_revenue_orig: r.TOTAL_REVENUE_ORIG != null ? Number(r.TOTAL_REVENUE_ORIG) : null,
    currency_code:      String(r.CURRENCY_CODE ?? "MDL"),
    last_order_date: r.LAST_ORDER_DATE instanceof Date
      ? r.LAST_ORDER_DATE.toISOString()
      : (r.LAST_ORDER_DATE ?? null),
    order_count:    Number(r.ORDER_COUNT ?? 0),
    tg_linked:      Number(r.TG_LINKED) === 1,
    rfm_r:          r.RFM_R != null ? Number(r.RFM_R) : null,
    rfm_f:          Number(r.RFM_F ?? 0),
    rfm_m:          Number(r.RFM_M ?? 0),
  })));
}
