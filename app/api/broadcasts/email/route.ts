import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";

interface CustomerRow {
  [key: string]: unknown;
  NAME: string | null;
  CONTACT_EMAIL: string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

const VALID_SEGMENTS = new Set(["all","vip","active","new","sleeping","churned"]);

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { segment, subject, message } = body;

  if (!subject || String(subject).trim() === "")
    return NextResponse.json({ error: "Тема письма обязательна" }, { status: 400 });
  if (!message || String(message).trim() === "")
    return NextResponse.json({ error: "Текст сообщения обязателен" }, { status: 400 });

  const seg  = typeof segment === "string" && VALID_SEGMENTS.has(segment) ? segment : "all";
  const subj = String(subject).trim();
  const text = String(message).trim();

  let segJoin = "";
  let segWhere = "";
  if (seg !== "all") {
    segJoin = `
      LEFT JOIN (
        SELECT CUSTOMER_ID,
               SUM(TOTAL_AMOUNT) TOTAL_REV,
               COUNT(*)          ORD_CNT,
               MAX(DOC_DATE)     LAST_DATE,
               MIN(DOC_DATE)     FIRST_DATE
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
        GROUP BY CUSTOMER_ID
      ) seg_s ON seg_s.CUSTOMER_ID = c.ID
      LEFT JOIN (
        SELECT CUSTOMER_ID, SUM(TOTAL_AMOUNT) REV90
        FROM AGRO_SALES_DOCS
        WHERE STATUS NOT IN ('draft','cancelled')
          AND DOC_DATE >= SYSDATE - 90
        GROUP BY CUSTOMER_ID
      ) seg_s90 ON seg_s90.CUSTOMER_ID = c.ID`;

    const segCondMap: Record<string, string> = {
      new:      `AND (seg_s.FIRST_DATE >= SYSDATE - 30 AND NVL(seg_s.ORD_CNT,0) <= 3)`,
      vip:      `AND NVL(seg_s90.REV90,0) >= 50000`,
      active:   `AND seg_s.LAST_DATE >= SYSDATE - 60 AND NVL(seg_s90.REV90,0) < 50000 AND NOT (seg_s.FIRST_DATE >= SYSDATE - 30 AND NVL(seg_s.ORD_CNT,0) <= 3)`,
      sleeping: `AND seg_s.LAST_DATE < SYSDATE - 60 AND seg_s.LAST_DATE >= SYSDATE - 180`,
      churned:  `AND (seg_s.LAST_DATE < SYSDATE - 180 OR seg_s.LAST_DATE IS NULL) AND NVL(seg_s.ORD_CNT,0) > 0`,
    };
    segWhere = segCondMap[seg] ?? "";
  }

  const recipients = await query<CustomerRow>(`
    SELECT c.NAME, c.CONTACT_EMAIL
    FROM AGRO_CUSTOMERS c
    ${segJoin}
    WHERE c.ACTIVE = 'Y'
      AND c.CONTACT_EMAIL IS NOT NULL
      ${segWhere}
  `, []);

  if (recipients.length === 0)
    return NextResponse.json({ error: "Нет получателей с email в этом сегменте", sent: 0 }, { status: 400 });

  let sent = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    try {
      await sendEmail({ to: String(r.CONTACT_EMAIL), subject: subj, text });
      sent++;
    } catch (err) {
      errors.push(`${r.NAME ?? r.CONTACT_EMAIL}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ success: true, sent, total: recipients.length, errors });
}
