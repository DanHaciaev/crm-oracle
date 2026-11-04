import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface PurchaseRow {
  [key: string]: unknown;
  ID:               number;
  DOC_NUMBER:       string;
  DOC_DATE:         Date | string | null;
  SUPPLIER_NAME:    string | null;
  SUPPLIER_ID:      number | null;
  WAREHOUSE_NAME:   string | null;
  STATUS:           string;
  TOTAL_GROSS_KG:   number | null;
  TOTAL_NET_KG:     number | null;
  TOTAL_AMOUNT:     number | null;
  TOTAL_AMOUNT_MDL: number | null;
  CURRENCY_CODE:    string | null;
  IS_OWN_PRODUCTION: string | null;
}

interface CountRow { [key: string]: unknown; CNT: number; }

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const from       = sp.get("from");
  const to         = sp.get("to");
  const supplierId = sp.get("supplier_id");
  const status     = sp.get("status");
  const page       = Math.max(1, Number(sp.get("page") ?? "1") || 1);

  const VALID_STATUSES = new Set(["draft", "confirmed", "closed", "cancelled"]);

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (from)       { binds.push(from);              conditions.push(`pd.DOC_DATE >= TO_DATE(:${binds.length},'YYYY-MM-DD')`); }
  if (to)         { binds.push(to);                conditions.push(`pd.DOC_DATE <  TO_DATE(:${binds.length},'YYYY-MM-DD')`); }
  if (supplierId) { binds.push(Number(supplierId)); conditions.push(`pd.SUPPLIER_ID = :${binds.length}`); }
  if (status && VALID_STATUSES.has(status)) { binds.push(status); conditions.push(`pd.STATUS = :${binds.length}`); }

  const where  = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const minRow = (page - 1) * PAGE_SIZE;
  const maxRow = page * PAGE_SIZE;

  interface StatusCountRow { [key: string]: unknown; STATUS: string; CNT: number; }

  const [rows, countRows, statusRows] = await Promise.all([
    query<PurchaseRow>(`
      SELECT * FROM (
        SELECT q.*, ROWNUM RN FROM (
          SELECT
            pd.ID,
            pd.DOC_NUMBER,
            pd.DOC_DATE,
            s.NAME                                              AS SUPPLIER_NAME,
            pd.SUPPLIER_ID,
            w.NAME                                              AS WAREHOUSE_NAME,
            pd.STATUS,
            NVL(pd.TOTAL_GROSS_KG, 0)                          AS TOTAL_GROSS_KG,
            NVL(pd.TOTAL_NET_KG, 0)                             AS TOTAL_NET_KG,
            NVL(pd.TOTAL_AMOUNT, 0)                            AS TOTAL_AMOUNT,
            NVL(pd.TOTAL_AMOUNT_MDL, NVL(pd.TOTAL_AMOUNT, 0)) AS TOTAL_AMOUNT_MDL,
            NVL(pd.CURRENCY_CODE, 'MDL')                       AS CURRENCY_CODE,
            pd.IS_OWN_PRODUCTION
          FROM AGRO_PURCHASE_DOCS pd
          LEFT JOIN AGRO_SUPPLIERS  s ON s.ID = pd.SUPPLIER_ID
          LEFT JOIN AGRO_WAREHOUSES w ON w.ID = pd.WAREHOUSE_ID
          ${where}
          ORDER BY pd.DOC_DATE DESC, pd.ID DESC
        ) q WHERE ROWNUM <= :maxRow
      ) WHERE RN > :minRow
    `, [...binds, maxRow, minRow]),

    query<CountRow>(`
      SELECT COUNT(*) CNT
      FROM AGRO_PURCHASE_DOCS pd
      ${where}
    `, binds),

    query<StatusCountRow>(`
      SELECT pd.STATUS, COUNT(*) CNT
      FROM AGRO_PURCHASE_DOCS pd
      ${where}
      GROUP BY pd.STATUS
    `, binds),
  ]);

  const total = Number(countRows[0]?.CNT ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusCounts: Record<string, number> = {};
  for (const r of statusRows) statusCounts[r.STATUS] = Number(r.CNT);

  return NextResponse.json(
    {
      docs: rows.map((r) => ({
        id:                 r.ID,
        doc_number:         r.DOC_NUMBER,
        doc_date:           r.DOC_DATE instanceof Date ? r.DOC_DATE.toISOString() : (r.DOC_DATE ?? null),
        supplier_name:      r.SUPPLIER_NAME ?? "",
        supplier_id:        r.SUPPLIER_ID,
        warehouse_name:     r.WAREHOUSE_NAME ?? "",
        status:             r.STATUS,
        total_gross_kg:     Number(r.TOTAL_GROSS_KG ?? 0),
        total_net_kg:       Number(r.TOTAL_NET_KG ?? 0),
        total_amount:       Number(r.TOTAL_AMOUNT ?? 0),
        total_amount_mdl:   Number(r.TOTAL_AMOUNT_MDL ?? 0),
        currency_code:      String(r.CURRENCY_CODE ?? "MDL"),
        is_own_production:  r.IS_OWN_PRODUCTION === "Y",
      })),
      total,
      page,
      pages,
      status_counts: statusCounts,
    },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } }
  );
}
