import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface HeaderRow {
  ID:               number;
  TICKET_NUMBER:    string;
  TICKET_DATE:      Date | string | null;
  STATUS:           string;
  OPERATOR:         string | null;
  NOTES:            string | null;
  CREATED_AT:       Date | string | null;
  CUSTOMER_NAME:    string | null;
  WAREHOUSE_NAME:   string | null;
  SALES_DOC_NUMBER: string | null;
}

interface LineRow {
  ID:           number;
  LINE_NO:      number | null;
  CRATE_CODE:   string | null;
  BATCH_NUMBER: string | null;
  ITEM_NAME:    string | null;
  ITEM_NAME_RO: string | null;
  GROSS_KG:     number | null;
  TARE_KG:      number | null;
  NET_KG:       number | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function dateToIso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isFinite(ticketId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const headers = await query<HeaderRow>(`
    SELECT
      t.ID, t.TICKET_NUMBER, t.TICKET_DATE, t.STATUS,
      t.OPERATOR, t.NOTES, t.CREATED_AT,
      c.NAME  AS CUSTOMER_NAME,
      w.NAME  AS WAREHOUSE_NAME,
      sd.DOC_NUMBER AS SALES_DOC_NUMBER
    FROM AGRO_WEIGHT_TICKETS t
    LEFT JOIN AGRO_CUSTOMERS  c  ON c.ID  = t.CUSTOMER_ID
    LEFT JOIN AGRO_WAREHOUSES w  ON w.ID  = t.WAREHOUSE_ID
    LEFT JOIN AGRO_SALES_DOCS sd ON sd.ID = t.SALES_DOC_ID
    WHERE t.ID = :1
  `, [ticketId]);

  if (headers.length === 0) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  const h = headers[0];

  const lines = await query<LineRow>(`
    SELECT
      l.ID, l.LINE_NO, l.CRATE_CODE, l.GROSS_KG, l.TARE_KG, l.NET_KG,
      b.BATCH_NUMBER,
      i.NAME_RU AS ITEM_NAME,
      i.NAME_RO AS ITEM_NAME_RO
    FROM AGRO_WEIGHT_TICKET_LINES l
    LEFT JOIN AGRO_BATCHES b ON b.ID = l.BATCH_ID
    LEFT JOIN AGRO_ITEMS   i ON i.ID = l.ITEM_ID
    WHERE l.TICKET_ID = :1
    ORDER BY l.LINE_NO ASC NULLS LAST, l.ID ASC
  `, [ticketId]);

  return NextResponse.json({
    id:               h.ID,
    ticket_number:    h.TICKET_NUMBER,
    ticket_date:      dateToIso(h.TICKET_DATE),
    status:           h.STATUS,
    operator:         h.OPERATOR,
    notes:            h.NOTES,
    created_at:       dateToIso(h.CREATED_AT),
    customer_name:    h.CUSTOMER_NAME,
    warehouse_name:   h.WAREHOUSE_NAME,
    sales_doc_number: h.SALES_DOC_NUMBER,
    lines: lines.map((l) => ({
      id:           l.ID,
      line_no:      l.LINE_NO,
      crate_code:   l.CRATE_CODE,
      batch_number: l.BATCH_NUMBER,
      item_name:    l.ITEM_NAME,
      item_name_ro: l.ITEM_NAME_RO,
      gross_kg:     Number(l.GROSS_KG ?? 0),
      tare_kg:      Number(l.TARE_KG ?? 0),
      net_kg:       Number(l.NET_KG ?? 0),
    })),
  });
}
