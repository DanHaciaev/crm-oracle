import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { fmtDate, n, s } from "@/lib/documents/common";

type Row = Record<string, unknown>;

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const LIMIT = 200;

// Source records for the Documents hub: the latest rows each printable
// document can be built from (ROWNUM — the DB is Oracle 11g).
export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [sales, purchases, releases, checks, warehouses] = await Promise.all([
    query<Row>(`
      SELECT * FROM (
        SELECT sd.ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, sd.STATUS, sd.TOTAL_NET_KG,
               c.NAME AS PARTY,
               (SELECT COUNT(*) FROM AGRO_EXPORT_DECLS ed WHERE ed.SALES_DOC_ID = sd.ID) AS DECLS
        FROM AGRO_SALES_DOCS sd
        LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
        ORDER BY sd.DOC_DATE DESC, sd.ID DESC
      ) WHERE ROWNUM <= ${LIMIT}
    `),
    query<Row>(`
      SELECT * FROM (
        SELECT pd.ID, pd.DOC_NUMBER, pd.DOC_DATE, pd.STATUS, pd.TOTAL_NET_KG, s.NAME AS PARTY
        FROM AGRO_PURCHASE_DOCS pd
        LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
        ORDER BY pd.DOC_DATE DESC, pd.ID DESC
      ) WHERE ROWNUM <= ${LIMIT}
    `),
    query<Row>(`
      SELECT * FROM (
        SELECT cr.ID, cr.RELEASE_NUMBER AS DOC_NUMBER, cr.RELEASE_DATE AS DOC_DATE, cr.TOTAL_QTY_KG AS TOTAL_NET_KG,
               sc.NAME AS PARTY
        FROM AGRO_CUSTODY_RELEASES cr
        JOIN AGRO_STORAGE_CLIENTS sc ON sc.ID = cr.STORAGE_CLIENT_ID
        ORDER BY cr.RELEASE_DATE DESC, cr.ID DESC
      ) WHERE ROWNUM <= ${LIMIT}
    `),
    query<Row>(`
      SELECT * FROM (
        SELECT qc.ID, qc.CHECK_DATE AS DOC_DATE, qc.RESULT AS STATUS, qc.INSPECTOR AS PARTY,
               cl.CHECKLIST_TYPE, cl.NAME_RU AS CHECKLIST_NAME, b.BATCH_NUMBER AS DOC_NUMBER
        FROM AGRO_QA_CHECKS qc
        JOIN AGRO_QA_CHECKLISTS cl ON cl.ID = qc.CHECKLIST_ID
        LEFT JOIN AGRO_BATCHES b ON b.ID = qc.BATCH_ID
        ORDER BY qc.CHECK_DATE DESC, qc.ID DESC
      ) WHERE ROWNUM <= ${LIMIT}
    `),
    query<Row>(`SELECT ID, NAME FROM AGRO_WAREHOUSES WHERE ACTIVE = 'Y' ORDER BY NAME`),
  ]);

  const rec = (r: Row) => ({
    id:         n(r.ID),
    doc_number: s(r.INVOICE_NUMBER) || s(r.DOC_NUMBER),
    doc_date:   fmtDate(r.DOC_DATE),
    party:      s(r.PARTY),
    status:     s(r.STATUS),
    net_kg:     r.TOTAL_NET_KG != null ? n(r.TOTAL_NET_KG) : null,
  });

  return NextResponse.json({
    sales:     sales.map(r => ({ ...rec(r), has_decl: n(r.DECLS) > 0 })),
    purchases: purchases.map(rec),
    releases:  releases.map(rec),
    checks:    checks.map(r => ({ ...rec(r), checklist_type: s(r.CHECKLIST_TYPE), checklist_name: s(r.CHECKLIST_NAME) })),
    warehouses: warehouses.map(r => ({ id: n(r.ID), name: s(r.NAME) })),
  });
}
