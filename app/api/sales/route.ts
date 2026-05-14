import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface SalesRow {
  [key: string]: unknown;
  ID:               number;
  DOC_NUMBER:       string;
  DOC_DATE:         Date | string | null;
  CUSTOMER_NAME:    string | null;
  CUSTOMER_ID:      number | null;
  SALE_TYPE:        string | null;
  STATUS:           string;
  TOTAL_AMOUNT:     number | null;
  TOTAL_AMOUNT_MDL: number | null;
  CURRENCY_CODE:    string | null;
  TOTAL_NET_KG:     number | null;
  INVOICE_NUMBER:   string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const from       = sp.get("from");
  const to         = sp.get("to");
  const customerId = sp.get("customer_id");
  const status     = sp.get("status");
  const saleType   = sp.get("sale_type");

  const VALID_STATUSES  = new Set(["draft","confirmed","shipped","closed","cancelled"]);
  const VALID_TYPES     = new Set(["domestic","export"]);

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (from)       { binds.push(from);            conditions.push(`sd.DOC_DATE >= TO_DATE(:${binds.length},'YYYY-MM-DD')`); }
  if (to)         { binds.push(to);              conditions.push(`sd.DOC_DATE <  TO_DATE(:${binds.length},'YYYY-MM-DD')`); }
  if (customerId) { binds.push(Number(customerId)); conditions.push(`sd.CUSTOMER_ID = :${binds.length}`); }

  const statusCond   = status   && VALID_STATUSES.has(status)   ? `AND sd.STATUS    = '${status}'`    : "";
  const saleTypeCond = saleType && VALID_TYPES.has(saleType)     ? `AND sd.SALE_TYPE = '${saleType}'`  : "";

  const where = conditions.length
    ? "WHERE " + conditions.join(" AND ")
    : "WHERE 1=1";

  const rows = await query<SalesRow>(`
    SELECT
      sd.ID,
      sd.DOC_NUMBER,
      sd.DOC_DATE,
      c.NAME                                                   AS CUSTOMER_NAME,
      sd.CUSTOMER_ID,
      sd.SALE_TYPE,
      sd.STATUS,
      NVL(sd.TOTAL_AMOUNT, 0)                                 AS TOTAL_AMOUNT,
      NVL(sd.TOTAL_AMOUNT_MDL, NVL(sd.TOTAL_AMOUNT, 0))      AS TOTAL_AMOUNT_MDL,
      NVL(sd.CURRENCY_CODE, 'MDL')                            AS CURRENCY_CODE,
      NVL(sd.TOTAL_NET_KG, 0)                                 AS TOTAL_NET_KG,
      sd.INVOICE_NUMBER
    FROM AGRO_SALES_DOCS sd
    LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
    ${where}
      ${statusCond}
      ${saleTypeCond}
    ORDER BY sd.DOC_DATE DESC, sd.ID DESC
  `, binds);

  return NextResponse.json(rows.map((r) => ({
    id:               r.ID,
    doc_number:       r.DOC_NUMBER,
    doc_date:         r.DOC_DATE instanceof Date ? r.DOC_DATE.toISOString() : (r.DOC_DATE ?? null),
    customer_name:    r.CUSTOMER_NAME ?? "",
    customer_id:      r.CUSTOMER_ID,
    sale_type:        r.SALE_TYPE ?? "",
    status:           r.STATUS,
    total_amount:     Number(r.TOTAL_AMOUNT ?? 0),
    total_amount_mdl: Number(r.TOTAL_AMOUNT_MDL ?? 0),
    currency_code:    String(r.CURRENCY_CODE ?? "MDL"),
    total_net_kg:     Number(r.TOTAL_NET_KG ?? 0),
    invoice_number:   r.INVOICE_NUMBER ?? "",
  })));
}
