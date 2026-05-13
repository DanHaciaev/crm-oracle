import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import oracledb from "oracledb";
import { getConnection } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { subDays, startOfYear, addDays, format } from "date-fns";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

// Return tomorrow as upper bound so DOC_DATE < tomorrow includes all of today
function getPeriodDates(period: string) {
  const now = new Date();
  let from: Date;
  switch (period) {
    case "7d":  from = subDays(now, 7);  break;
    case "90d": from = subDays(now, 90); break;
    case "ytd": from = startOfYear(now); break;
    default:    from = subDays(now, 30);
  }
  const span = now.getTime() - from.getTime();
  return {
    f:  format(from,           "yyyy-MM-dd"),
    t:  format(addDays(now, 1),"yyyy-MM-dd"), // exclusive upper bound — includes today
    pf: format(new Date(from.getTime() - span), "yyyy-MM-dd"),
  };
}

function groupExpr(period: string) {
  if (period === "ytd") return "TRUNC(DOC_DATE,'MM')";
  if (period === "90d") return "TRUNC(DOC_DATE,'IW')";
  return "TRUNC(DOC_DATE)";
}

function fmtLabel(s: string, period: string): string {
  try {
    const [, mo, dy] = s.split("-").map(Number);
    const M = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
    if (period === "ytd") return M[mo - 1] ?? s;
    return `${dy} ${M[mo - 1] ?? ""}`;
  } catch { return s; }
}

// Validate sale type and return a safe SQL fragment (string interpolation — never raw user input)
const VALID_SALE_TYPES = new Set(["all", "domestic", "export"]);
function saleTypeCondition(raw: string): string {
  const st = VALID_SALE_TYPES.has(raw) ? raw : "all";
  // Safe: only 'domestic' or 'export' reach the SQL, both are hard-coded ASCII strings
  return st === "all" ? "" : `AND SALE_TYPE = '${st}'`;
}

type Row = Record<string, unknown>;
function n(v: unknown): number { return v == null ? 0 : Number(v); }

const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const period   = sp.get("period")   ?? "30d";
  const saleType = sp.get("saleType") ?? "all";

  const { f, t, pf } = getPeriodDates(period);
  const gb   = groupExpr(period);
  const stCond = saleTypeCondition(saleType); // e.g. "" | "AND SALE_TYPE = 'domestic'"

  const conn = await getConnection();
  try {
    // ── 1. KPI current ──────────────────────────────────────────────────────
    const kpiR = await conn.execute<Row>(`
      SELECT NVL(SUM(TOTAL_AMOUNT),0) R, COUNT(*) O, COUNT(DISTINCT CUSTOMER_ID) C
      FROM AGRO_SALES_DOCS
      WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
        AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
        AND STATUS NOT IN ('draft','cancelled')
        ${stCond}
    `, [f, t], opts);

    // ── 2. KPI previous period ───────────────────────────────────────────────
    const kpiPR = await conn.execute<Row>(`
      SELECT NVL(SUM(TOTAL_AMOUNT),0) R, COUNT(*) O
      FROM AGRO_SALES_DOCS
      WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
        AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
        AND STATUS NOT IN ('draft','cancelled')
        ${stCond}
    `, [pf, f], opts);

    // ── 3. Unread messages ───────────────────────────────────────────────────
    const unreadR = await conn.execute<Row>(
      `SELECT NVL(SUM(UNREAD_COUNT),0) U FROM AGRO_CRM_APP_USERS WHERE STATUS != 'blocked'`,
      [], opts
    );

    // ── 4. Revenue trend ─────────────────────────────────────────────────────
    const revR = await conn.execute<Row>(`
      SELECT TO_CHAR(GD,'YYYY-MM-DD') D, REV, ORD FROM (
        SELECT ${gb} GD, NVL(SUM(TOTAL_AMOUNT),0) REV, COUNT(*) ORD
        FROM AGRO_SALES_DOCS
        WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
          AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
          AND STATUS NOT IN ('draft','cancelled')
          ${stCond}
        GROUP BY ${gb}
      ) ORDER BY GD
    `, [f, t], opts);

    // ── 5. Top customers ─────────────────────────────────────────────────────
    const custR = await conn.execute<Row>(`
      SELECT * FROM (
        SELECT c.NAME NM, NVL(SUM(sd.TOTAL_AMOUNT),0) REV, COUNT(*) ORD
        FROM AGRO_SALES_DOCS sd
        JOIN AGRO_CUSTOMERS c ON sd.CUSTOMER_ID = c.ID
        WHERE sd.DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
          AND sd.DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
          AND sd.STATUS NOT IN ('draft','cancelled')
          ${stCond.replace("SALE_TYPE", "sd.SALE_TYPE")}
        GROUP BY c.ID, c.NAME
        ORDER BY REV DESC
      ) WHERE ROWNUM <= 8
    `, [f, t], opts);

    // ── 6. Top items ─────────────────────────────────────────────────────────
    const itemsR = await conn.execute<Row>(`
      SELECT * FROM (
        SELECT i.NAME_RU NM, NVL(SUM(sl.AMOUNT),0) REV, NVL(SUM(sl.NET_WEIGHT_KG),0) WGT
        FROM AGRO_SALES_LINES sl
        JOIN AGRO_ITEMS i ON sl.ITEM_ID = i.ID
        JOIN AGRO_SALES_DOCS sd ON sl.SALES_DOC_ID = sd.ID
        WHERE sd.DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
          AND sd.DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
          AND sd.STATUS NOT IN ('draft','cancelled')
          ${stCond.replace("SALE_TYPE", "sd.SALE_TYPE")}
        GROUP BY i.ID, i.NAME_RU
        ORDER BY REV DESC
      ) WHERE ROWNUM <= 8
    `, [f, t], opts);

    // ── 7. Order status breakdown ────────────────────────────────────────────
    const statusR = await conn.execute<Row>(`
      SELECT STATUS ST, COUNT(*) CNT
      FROM AGRO_SALES_DOCS
      WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
        AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
        ${stCond}
      GROUP BY STATUS
    `, [f, t], opts);

    // ── 8. Churn risk ────────────────────────────────────────────────────────
    const churnR = await conn.execute<Row>(`
      SELECT * FROM (
        SELECT c.NAME NM,
          NVL(cur.A,0)                           AS CA,
          prv.A                                  AS PA,
          ROUND((NVL(cur.A,0)/prv.A - 1)*100, 1) AS PC
        FROM AGRO_CUSTOMERS c
        JOIN (
          SELECT CUSTOMER_ID, SUM(TOTAL_AMOUNT) A
          FROM AGRO_SALES_DOCS
          WHERE DOC_DATE >= TO_DATE(:1,'YYYY-MM-DD')
            AND DOC_DATE <  TO_DATE(:2,'YYYY-MM-DD')
            AND STATUS NOT IN ('draft','cancelled')
          GROUP BY CUSTOMER_ID
        ) prv ON c.ID = prv.CUSTOMER_ID
        LEFT JOIN (
          SELECT CUSTOMER_ID, SUM(TOTAL_AMOUNT) A
          FROM AGRO_SALES_DOCS
          WHERE DOC_DATE >= TO_DATE(:3,'YYYY-MM-DD')
            AND DOC_DATE <  TO_DATE(:4,'YYYY-MM-DD')
            AND STATUS NOT IN ('draft','cancelled')
          GROUP BY CUSTOMER_ID
        ) cur ON c.ID = cur.CUSTOMER_ID
        WHERE NVL(cur.A,0) < prv.A * 0.7
        ORDER BY PC ASC
      ) WHERE ROWNUM <= 10
    `, [pf, f, f, t], opts);

    // ── 9. Recent orders ─────────────────────────────────────────────────────
    const recentR = await conn.execute<Row>(`
      SELECT * FROM (
        SELECT sd.DOC_NUMBER DN, TO_CHAR(sd.DOC_DATE,'DD.MM.YYYY') DD,
          c.NAME CN, NVL(sd.TOTAL_AMOUNT,0) AMT, NVL(sd.TOTAL_NET_KG,0) WGT, sd.STATUS ST
        FROM AGRO_SALES_DOCS sd
        JOIN AGRO_CUSTOMERS c ON sd.CUSTOMER_ID = c.ID
        WHERE 1=1
          ${stCond.replace("SALE_TYPE", "sd.SALE_TYPE")}
        ORDER BY sd.DOC_DATE DESC, sd.ID DESC
      ) WHERE ROWNUM <= 15
    `, [], opts);

    const kpi  = (kpiR.rows  ?? [])[0] ?? {};
    const kpiP = (kpiPR.rows ?? [])[0] ?? {};
    const unr  = (unreadR.rows ?? [])[0] ?? {};

    return NextResponse.json({
      kpi: {
        revenue:          n(kpi.R),
        orders:           n(kpi.O),
        active_customers: n(kpi.C),
        unread:           n(unr.U),
        revenue_prev:     n(kpiP.R),
        orders_prev:      n(kpiP.O),
      },
      revenue_by_day: (revR.rows ?? []).map(r => ({
        date:    fmtLabel(String(r.D ?? ""), period),
        revenue: n(r.REV),
        orders:  n(r.ORD),
      })),
      top_customers: (custR.rows ?? []).map(r => ({
        name: String(r.NM ?? ""), revenue: n(r.REV), orders: n(r.ORD),
      })),
      top_items: (itemsR.rows ?? []).map(r => ({
        name: String(r.NM ?? ""), revenue: n(r.REV), weight_kg: n(r.WGT),
      })),
      order_statuses: (statusR.rows ?? []).map(r => ({
        status: String(r.ST ?? ""), count: n(r.CNT),
      })),
      churn_risk: (churnR.rows ?? []).map(r => ({
        name: String(r.NM ?? ""), curr: n(r.CA), prev: n(r.PA), pct: n(r.PC),
      })),
      recent_orders: (recentR.rows ?? []).map(r => ({
        doc_number:    String(r.DN ?? ""),
        doc_date:      String(r.DD ?? ""),
        customer_name: String(r.CN ?? ""),
        amount:        n(r.AMT),
        weight_kg:     n(r.WGT),
        status:        String(r.ST ?? ""),
      })),
    });

  } catch (err) {
    console.error("[dashboard/stats]", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  } finally {
    await conn.close();
  }
}
