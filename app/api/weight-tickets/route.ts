import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface TicketRow {
  [key: string]: unknown;
  ID:               number;
  TICKET_NUMBER:    string;
  TICKET_DATE:      Date | string | null;
  STATUS:           string;
  OPERATOR:         string | null;
  CUSTOMER_NAME:    string | null;
  WAREHOUSE_NAME:   string | null;
  SALES_DOC_NUMBER: string | null;
  NET_KG:           number | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from"); // YYYY-MM-DD, optional
  const to   = sp.get("to");   // YYYY-MM-DD, optional

  let dateClause = "";
  const binds: string[] = [];
  if (from) { binds.push(from); dateClause += ` AND t.TICKET_DATE >= TO_DATE(:${binds.length},'YYYY-MM-DD')`; }
  if (to)   { binds.push(to);   dateClause += ` AND t.TICKET_DATE <  TO_DATE(:${binds.length},'YYYY-MM-DD')`; }

  const rows = await query<TicketRow>(`
    SELECT
      t.ID,
      t.TICKET_NUMBER,
      t.TICKET_DATE,
      t.STATUS,
      t.OPERATOR,
      c.NAME  AS CUSTOMER_NAME,
      w.NAME  AS WAREHOUSE_NAME,
      sd.DOC_NUMBER AS SALES_DOC_NUMBER,
      (SELECT NVL(SUM(l.NET_KG), 0) FROM AGRO_WEIGHT_TICKET_LINES l WHERE l.TICKET_ID = t.ID) AS NET_KG
    FROM AGRO_WEIGHT_TICKETS t
    LEFT JOIN AGRO_CUSTOMERS  c  ON c.ID  = t.CUSTOMER_ID
    LEFT JOIN AGRO_WAREHOUSES w  ON w.ID  = t.WAREHOUSE_ID
    LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = t.SALES_DOC_ID
    WHERE 1=1${dateClause}
    ORDER BY t.TICKET_DATE DESC, t.ID DESC
  `, binds);

  return NextResponse.json(rows.map((r) => ({
    id:               r.ID,
    ticket_number:    r.TICKET_NUMBER,
    ticket_date:      r.TICKET_DATE instanceof Date ? r.TICKET_DATE.toISOString() : (r.TICKET_DATE ?? null),
    status:           r.STATUS,
    operator:         r.OPERATOR,
    customer_name:    r.CUSTOMER_NAME,
    warehouse_name:   r.WAREHOUSE_NAME,
    sales_doc_number: r.SALES_DOC_NUMBER,
    net_kg:           Number(r.NET_KG ?? 0),
  })));
}
