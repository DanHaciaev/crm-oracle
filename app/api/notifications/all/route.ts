import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { can, type Module } from "@/lib/permissions";
import { userAccess } from "@/lib/permissions-server";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

interface Item { id: string; title: string; subtitle: string; date: string | null; href: string }
interface Section { key: string; severity: "critical" | "warning" | "info"; items: Item[] }

// Full Notifications page: everything that needs attention right now (the
// header bell shows the first few of the same signals). Nothing is stored —
// each section is computed live and only for sections the role can see.
const SECTIONS: { key: string; module: Module; severity: Section["severity"]; sql: string; map: (r: Row) => Item }[] = [
  { key: "overdue_tasks", module: "tasks", severity: "warning",
    sql: `SELECT t.ID, t.TITLE, c.NAME AS CUSTOMER_NAME, t.DUE_DATE, t.PRIORITY FROM AGRO_CRM_TASKS t
          LEFT JOIN AGRO_CUSTOMERS c ON c.ID = t.CUSTOMER_ID
          WHERE t.STATUS IN ('open','in_progress') AND t.DUE_DATE IS NOT NULL AND t.DUE_DATE < SYSDATE
          ORDER BY t.DUE_DATE`,
    map: r => ({ id: `t${r.ID}`, title: String(r.TITLE ?? ""), subtitle: [r.CUSTOMER_NAME, r.PRIORITY].filter(Boolean).join(" · "), date: iso(r.DUE_DATE), href: "/tasks" }) },
  { key: "unread_messages", module: "inbox", severity: "info",
    sql: `SELECT au.ID, au.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME, au.UNREAD_COUNT, au.LAST_MESSAGE_AT FROM AGRO_CRM_APP_USERS au
          LEFT JOIN AGRO_CUSTOMERS c ON c.ID = au.CUSTOMER_ID
          WHERE au.UNREAD_COUNT > 0 ORDER BY au.LAST_MESSAGE_AT DESC NULLS LAST`,
    map: r => ({ id: `m${r.ID}`, title: String(r.CUSTOMER_NAME ?? `#${r.ID}`), subtitle: `${r.UNREAD_COUNT}`, date: iso(r.LAST_MESSAGE_AT), href: "/inbox" }) },
  { key: "expired_batches", module: "warehouse", severity: "critical",
    sql: `SELECT b.ID, b.BATCH_NUMBER, b.EXPIRY_DATE, b.CURRENT_QTY_KG, i.NAME_RU AS ITEM, w.NAME AS WH FROM AGRO_BATCHES b
          LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
          WHERE b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 AND b.EXPIRY_DATE < TRUNC(SYSDATE) ORDER BY b.EXPIRY_DATE`,
    map: r => ({ id: `e${r.ID}`, title: String(r.BATCH_NUMBER ?? ""), subtitle: [r.ITEM, r.WH, `${Math.round(Number(r.CURRENT_QTY_KG))} kg`].filter(Boolean).join(" · "), date: iso(r.EXPIRY_DATE), href: `/warehouse?batch=${r.ID}` }) },
  { key: "expiring_batches", module: "warehouse", severity: "warning",
    sql: `SELECT b.ID, b.BATCH_NUMBER, b.EXPIRY_DATE, b.CURRENT_QTY_KG, i.NAME_RU AS ITEM, w.NAME AS WH FROM AGRO_BATCHES b
          LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
          WHERE b.STATUS = 'active' AND b.CURRENT_QTY_KG > 0 AND b.EXPIRY_DATE >= TRUNC(SYSDATE) AND b.EXPIRY_DATE < TRUNC(SYSDATE) + 8
          ORDER BY b.EXPIRY_DATE`,
    map: r => ({ id: `x${r.ID}`, title: String(r.BATCH_NUMBER ?? ""), subtitle: [r.ITEM, r.WH, `${Math.round(Number(r.CURRENT_QTY_KG))} kg`].filter(Boolean).join(" · "), date: iso(r.EXPIRY_DATE), href: `/warehouse?batch=${r.ID}` }) },
  { key: "storage_alerts", module: "warehouse", severity: "critical",
    sql: `SELECT a.ID, a.ALERT_TYPE, a.ACTUAL_VALUE, a.THRESHOLD_VALUE, a.CREATED_AT, c.CODE AS CELL FROM AGRO_STORAGE_ALERTS a
          LEFT JOIN AGRO_STORAGE_CELLS c ON c.ID = a.CELL_ID
          WHERE NVL(a.ACKNOWLEDGED, 'N') <> 'Y' ORDER BY a.CREATED_AT DESC`,
    map: r => ({ id: `a${r.ID}`, title: `${r.CELL ?? "—"} · ${r.ALERT_TYPE ?? ""}`, subtitle: `${r.ACTUAL_VALUE ?? "—"} / ${r.THRESHOLD_VALUE ?? "—"}`, date: iso(r.CREATED_AT), href: "/warehouse" }) },
  { key: "overdue_receivables", module: "payments", severity: "warning",
    // Rough per-document signal (no FIFO): shipped docs past the payment term
    // with nothing paid against them. The Receivables page has exact figures.
    sql: `SELECT sd.ID, sd.CUSTOMER_ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS NUM, c.NAME AS CUSTOMER_NAME, sd.TOTAL_AMOUNT,
                 NVL(sd.CURRENCY_CODE, 'MDL') AS CUR, sd.DOC_DATE + NVL(t.PAYMENT_DAYS, NVL((SELECT TO_NUMBER(CONFIG_VALUE) FROM AGRO_MODULE_CONFIG WHERE CONFIG_KEY = 'CRM_DEFAULT_PAYMENT_DAYS'), 30)) AS DUE
          FROM AGRO_SALES_DOCS sd
          JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
          LEFT JOIN AGRO_CRM_CUSTOMER_TERMS t ON t.CUSTOMER_ID = sd.CUSTOMER_ID
          WHERE sd.STATUS IN ('shipped','delivered','closed') AND sd.TOTAL_AMOUNT > 0
            AND sd.DOC_DATE + NVL(t.PAYMENT_DAYS, NVL((SELECT TO_NUMBER(CONFIG_VALUE) FROM AGRO_MODULE_CONFIG WHERE CONFIG_KEY = 'CRM_DEFAULT_PAYMENT_DAYS'), 30)) < TRUNC(SYSDATE)
            AND NOT EXISTS (SELECT 1 FROM AGRO_CRM_PAYMENTS p WHERE p.STATUS = 'active' AND p.CUSTOMER_ID = sd.CUSTOMER_ID)
          ORDER BY DUE`,
    map: r => ({ id: `o${r.ID}`, title: `${r.NUM} · ${r.CUSTOMER_NAME ?? ""}`, subtitle: `${Number(r.TOTAL_AMOUNT).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${r.CUR}`, date: iso(r.DUE), href: `/receivables?customer=${r.CUSTOMER_ID}` }) },
  { key: "globalgap", module: "suppliers", severity: "warning",
    sql: `SELECT ID, NAME, GLOBALGAP_CERT_NO, GLOBALGAP_EXPIRY FROM AGRO_SUPPLIERS
          WHERE ACTIVE = 'Y' AND GLOBALGAP_CERTIFIED = 'Y' AND GLOBALGAP_EXPIRY < TRUNC(SYSDATE) + 31 ORDER BY GLOBALGAP_EXPIRY`,
    map: r => ({ id: `g${r.ID}`, title: String(r.NAME ?? ""), subtitle: String(r.GLOBALGAP_CERT_NO ?? ""), date: iso(r.GLOBALGAP_EXPIRY), href: `/suppliers/${r.ID}` }) },
  { key: "stale_leads", module: "leads", severity: "info",
    sql: `SELECT l.ID, l.NAME, l.COMPANY, l.STATUS, l.UPDATED_AT, ROUND(SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE)) AS IDLE FROM AGRO_CRM_LEADS l
          WHERE l.STATUS NOT IN ('won','lost')
            AND ((l.STATUS IN ('new','contacted') AND SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE) > 3)
              OR (l.STATUS NOT IN ('new','contacted') AND SYSDATE - CAST(NVL(l.UPDATED_AT, l.CREATED_AT) AS DATE) > 7))
          ORDER BY IDLE DESC`,
    map: r => ({ id: `l${r.ID}`, title: String(r.NAME ?? ""), subtitle: [r.COMPANY, r.STATUS, `${r.IDLE} d`].filter(Boolean).join(" · "), date: iso(r.UPDATED_AT), href: `/leads?q=${encodeURIComponent(String(r.NAME ?? ""))}` }) },
  { key: "automations", module: "broadcasts", severity: "info",
    sql: `SELECT l.ID, r.NAME AS RULE_NAME, c.NAME AS CUSTOMER_NAME, l.FIRED_AT FROM AGRO_CRM_AUTOMATION_LOG l
          JOIN AGRO_CRM_AUTOMATION_RULES r ON r.ID = l.RULE_ID JOIN AGRO_CUSTOMERS c ON c.ID = l.CUSTOMER_ID
          WHERE l.FIRED_AT > SYSDATE - 7 AND l.RESULT = 'success' ORDER BY l.FIRED_AT DESC`,
    map: r => ({ id: `r${r.ID}`, title: String(r.RULE_NAME ?? ""), subtitle: String(r.CUSTOMER_NAME ?? ""), date: iso(r.FIRED_AT), href: "/broadcasts" }) },
];

export async function GET() {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sections: Section[] = await Promise.all(
    SECTIONS.filter(s => can(user.perms, s.module, "view")).map(async s => {
      try {
        const rows = await query<Row>(`SELECT * FROM (${s.sql}) WHERE ROWNUM <= 200`);
        return { key: s.key, severity: s.severity, items: rows.map(s.map) };
      } catch (e) {
        console.error(`[notifications/${s.key}]`, e);
        return { key: s.key, severity: s.severity, items: [] };
      }
    }));
  return NextResponse.json({ sections });
}
