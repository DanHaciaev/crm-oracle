import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";


interface SupplierRow {
  [key: string]: unknown;
  ID:         number;
  NAME:       string;
  CERT_NO:    string | null;
  EXPIRY:     Date | string;
  DAYS_LEFT:  number;
}

function fmtDate(v: Date | string) {
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU");
}

export async function GET() {
  const rows = await query<SupplierRow>(`
    SELECT ID, NAME, GLOBALGAP_CERT_NO AS CERT_NO,
           GLOBALGAP_EXPIRY AS EXPIRY,
           ROUND(GLOBALGAP_EXPIRY - SYSDATE) AS DAYS_LEFT
    FROM AGRO_SUPPLIERS
    WHERE ACTIVE = 'Y'
      AND GLOBALGAP_CERTIFIED = 'Y'
      AND GLOBALGAP_EXPIRY IS NOT NULL
      AND GLOBALGAP_EXPIRY <= TRUNC(SYSDATE) + 30
    ORDER BY GLOBALGAP_EXPIRY
  `);

  if (rows.length === 0)
    return NextResponse.json({ alerted: 0, reason: "No GlobalGAP certificates expiring in next 30 days" });

  for (const row of rows) {
    const title = `GlobalGAP поставщика «${row.NAME}» истекает через ${row.DAYS_LEFT} дн.`;
    await execute(
      `INSERT INTO AGRO_CRM_TASKS (TITLE, STATUS, PRIORITY, DUE_DATE, CREATED_AT, UPDATED_AT)
       SELECT :1, 'open', 'high', SYSDATE + 1, SYSDATE, SYSDATE FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM AGRO_CRM_TASKS
         WHERE TITLE LIKE :2 AND CREATED_AT > SYSDATE - 7
       )`,
      [title, `GlobalGAP поставщика «${row.NAME}»%`]
    );
  }

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (adminChatId) {
    const lines: string[] = [`📜 Истекающие сертификаты GlobalGAP (${rows.length}):`];
    for (const r of rows) {
      const cert = r.CERT_NO ? ` (№${r.CERT_NO})` : "";
      lines.push(`  • ${r.NAME}${cert}: истекает ${fmtDate(r.EXPIRY)} (через ${r.DAYS_LEFT} дн.)`);
    }
    await sendText(adminChatId, lines.join("\n"));
  }

  return NextResponse.json({ alerted: rows.length });
}
