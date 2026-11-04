import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { can, type Module } from "@/lib/permissions";
import { userAccess } from "@/lib/permissions-server";
import { pickName, parseLang, fmtDate } from "@/lib/documents/common";

type Row = Record<string, unknown>;
const LIMIT = 6;

interface Hit { id: number; title: string; subtitle: string; href: string }
interface Group { key: string; hits: Hit[] }

// One SQL per entity, each only run when the user's role can see that
// section. Matching is case-insensitive "contains"; :q is the pattern.
const SOURCES: { key: string; module: Module; sql: string; map: (r: Row, lang: "ro" | "ru" | "en") => Hit }[] = [
  { key: "customers", module: "customers",
    sql: `SELECT ID, NAME, CODE, TAX_ID, CONTACT_PHONE FROM AGRO_CUSTOMERS
          WHERE UPPER(NAME) LIKE :q OR UPPER(CODE) LIKE :q OR TAX_ID LIKE :q OR CONTACT_PHONE LIKE :q OR UPPER(CONTACT_EMAIL) LIKE :q
          ORDER BY NAME`,
    map: r => ({ id: Number(r.ID), title: String(r.NAME ?? ""), subtitle: [r.CODE, r.TAX_ID, r.CONTACT_PHONE].filter(Boolean).join(" · "), href: `/customers/${r.ID}` }) },
  { key: "suppliers", module: "suppliers",
    sql: `SELECT ID, NAME, CODE, TAX_ID, CONTACT_PHONE FROM AGRO_SUPPLIERS
          WHERE UPPER(NAME) LIKE :q OR UPPER(CODE) LIKE :q OR TAX_ID LIKE :q OR CONTACT_PHONE LIKE :q
          ORDER BY NAME`,
    map: r => ({ id: Number(r.ID), title: String(r.NAME ?? ""), subtitle: [r.CODE, r.TAX_ID, r.CONTACT_PHONE].filter(Boolean).join(" · "), href: `/suppliers/${r.ID}` }) },
  { key: "sales", module: "sales",
    sql: `SELECT sd.ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, c.NAME AS CUSTOMER FROM AGRO_SALES_DOCS sd
          LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
          WHERE UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q ORDER BY sd.DOC_DATE DESC`,
    map: r => {
      const num = String(r.INVOICE_NUMBER || r.DOC_NUMBER || "");
      return { id: Number(r.ID), title: num, subtitle: [r.CUSTOMER, fmtDate(r.DOC_DATE)].filter(Boolean).join(" · "), href: `/sales?q=${encodeURIComponent(num)}` };
    } },
  { key: "purchases", module: "purchases",
    sql: `SELECT pd.ID, pd.DOC_NUMBER, pd.DOC_DATE, s.NAME AS SUPPLIER FROM AGRO_PURCHASE_DOCS pd
          LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
          WHERE UPPER(pd.DOC_NUMBER) LIKE :q ORDER BY pd.DOC_DATE DESC`,
    map: r => ({ id: Number(r.ID), title: String(r.DOC_NUMBER ?? ""), subtitle: [r.SUPPLIER, fmtDate(r.DOC_DATE)].filter(Boolean).join(" · "), href: `/purchases?q=${encodeURIComponent(String(r.DOC_NUMBER ?? ""))}` }) },
  { key: "batches", module: "warehouse",
    sql: `SELECT b.ID, b.BATCH_NUMBER, b.CURRENT_QTY_KG, b.STATUS, i.NAME_RO, i.NAME_RU FROM AGRO_BATCHES b
          LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
          WHERE UPPER(b.BATCH_NUMBER) LIKE :q ORDER BY b.RECEIVED_AT DESC`,
    map: (r, lang) => ({ id: Number(r.ID), title: String(r.BATCH_NUMBER ?? ""),
      subtitle: [pickName(lang, r.NAME_RO, r.NAME_RU), `${Math.round(Number(r.CURRENT_QTY_KG ?? 0)).toLocaleString("ru-RU")} kg`, r.STATUS].filter(Boolean).join(" · "),
      href: `/warehouse?batch=${r.ID}` }) },
  { key: "leads", module: "leads",
    sql: `SELECT ID, NAME, COMPANY, PHONE FROM AGRO_CRM_LEADS
          WHERE UPPER(NAME) LIKE :q OR UPPER(COMPANY) LIKE :q OR PHONE LIKE :q OR UPPER(EMAIL) LIKE :q ORDER BY ID DESC`,
    map: r => ({ id: Number(r.ID), title: String(r.NAME ?? ""), subtitle: [r.COMPANY, r.PHONE].filter(Boolean).join(" · "), href: `/leads?q=${encodeURIComponent(String(r.NAME ?? ""))}` }) },
  { key: "items", module: "items",
    sql: `SELECT ID, CODE, NAME_RO, NAME_RU FROM AGRO_ITEMS
          WHERE UPPER(NAME_RO) LIKE :q OR UPPER(NAME_RU) LIKE :q OR UPPER(CODE) LIKE :q ORDER BY NAME_RO`,
    map: (r, lang) => {
      const name = pickName(lang, r.NAME_RO, r.NAME_RU);
      return { id: Number(r.ID), title: name, subtitle: String(r.CODE ?? ""), href: `/items?q=${encodeURIComponent(name)}` };
    } },
];

export async function GET(req: NextRequest) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const term = (sp.get("q") ?? "").trim().slice(0, 60);
  if (term.length < 2) return NextResponse.json({ groups: [] });
  const lang = parseLang(sp.get("lang"));
  // LIKE wildcards in the user's text are matched literally.
  const pattern = `%${term.toUpperCase().replace(/[!%_]/g, c => "!" + c)}%`;

  const groups: Group[] = await Promise.all(
    SOURCES.filter(s => can(user.perms, s.module, "view")).map(async s => {
      const sql = `SELECT * FROM (${s.sql.replace(/LIKE :q/g, "LIKE :q ESCAPE '!'")}) WHERE ROWNUM <= ${LIMIT}`;
      const rows = await query<Row>(sql, { q: pattern });
      return { key: s.key, hits: rows.map(r => s.map(r, lang)) };
    }));
  return NextResponse.json({ groups: groups.filter(g => g.hits.length) });
}
