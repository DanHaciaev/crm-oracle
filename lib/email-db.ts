import { query, execute } from "@/lib/oracle";
import type { EmailFull } from "@/lib/gmail";

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  const rows = await query<{ CNT: number }>(
    `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_EMAILS'`,
    []
  );
  if (Number(rows[0]?.CNT ?? 0) === 0) return; // таблица не создана — тихо пропускаем
  tableReady = true;
}

async function resolveLinks(addr: string | null): Promise<{ lead_id: number | null; customer_id: number | null }> {
  if (!addr) return { lead_id: null, customer_id: null };
  const clean = addr.toLowerCase().trim();

  const leads = await query<{ ID: number }>(`
    SELECT ID FROM AGRO_CRM_LEADS
    WHERE LOWER(EMAIL) = :1 AND ROWNUM = 1
  `, [clean]);

  const customers = await query<{ ID: number }>(`
    SELECT ID FROM AGRO_CUSTOMERS
    WHERE LOWER(CONTACT_EMAIL) = :1 AND ROWNUM = 1
  `, [clean]);

  return {
    lead_id:     leads[0]?.ID     ? Number(leads[0].ID)     : null,
    customer_id: customers[0]?.ID ? Number(customers[0].ID) : null,
  };
}

export async function syncInboundEmail(email: EmailFull): Promise<void> {
  await ensureTable();

  // skip if already synced
  if (email.messageId) {
    const existing = await query<{ ID: number }>(
      `SELECT ID FROM AGRO_CRM_EMAILS WHERE MESSAGE_ID = :1`,
      [email.messageId]
    );
    if (existing.length) return;
  }

  const links = await resolveLinks(email.fromAddress);

  await execute(`
    INSERT INTO AGRO_CRM_EMAILS
      (MESSAGE_ID, DIRECTION, FROM_ADDR, TO_ADDR, SUBJECT, BODY_TEXT, LEAD_ID, CUSTOMER_ID, SENT_AT)
    VALUES (:1, 'in', :2, :3, :4, :5, :6, :7, :8)
  `, [
    email.messageId ?? null,
    email.fromAddress ?? null,
    email.to         ?? null,
    (email.subject ?? "").slice(0, 1000),
    email.textBody   ?? "",
    links.lead_id,
    links.customer_id,
    email.date ? new Date(email.date) : null,
  ]);
}

export async function syncOutboundEmail(opts: {
  messageId: string;
  to: string;
  from: string;
  subject: string;
  text: string;
  sentAt: Date;
}): Promise<void> {
  await ensureTable();

  const links = await resolveLinks(opts.to);

  await execute(`
    INSERT INTO AGRO_CRM_EMAILS
      (MESSAGE_ID, DIRECTION, FROM_ADDR, TO_ADDR, SUBJECT, BODY_TEXT, LEAD_ID, CUSTOMER_ID, SENT_AT)
    VALUES (:1, 'out', :2, :3, :4, :5, :6, :7, :8)
  `, [
    opts.messageId,
    opts.from,
    opts.to,
    opts.subject.slice(0, 1000),
    opts.text,
    links.lead_id,
    links.customer_id,
    opts.sentAt,
  ]);
}

export interface EmailRecord {
  id: number;
  message_id: string | null;
  direction: "in" | "out";
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body_text: string | null;
  lead_id: number | null;
  customer_id: number | null;
  sent_at: string | null;
  synced_at: string | null;
}

export async function getEmailHistory(opts: {
  lead_id?: number;
  customer_id?: number;
  limit?: number;
}): Promise<EmailRecord[]> {
  await ensureTable();

  const conditions: string[] = ["1=1"];
  const binds: (number | null)[] = [];

  if (opts.lead_id != null) {
    binds.push(opts.lead_id);
    conditions.push(`LEAD_ID = :${binds.length}`);
  }
  if (opts.customer_id != null) {
    binds.push(opts.customer_id);
    conditions.push(`CUSTOMER_ID = :${binds.length}`);
  }

  const limit = opts.limit ?? 50;

  interface Row {
    ID: number; MESSAGE_ID: string | null; DIRECTION: string;
    FROM_ADDR: string | null; TO_ADDR: string | null; SUBJECT: string | null;
    BODY_TEXT: string | null; LEAD_ID: number | null; CUSTOMER_ID: number | null;
    SENT_AT: Date | string | null; SYNCED_AT: Date | string | null;
  }

  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT ID, MESSAGE_ID, DIRECTION, FROM_ADDR, TO_ADDR, SUBJECT,
             BODY_TEXT, LEAD_ID, CUSTOMER_ID, SENT_AT, SYNCED_AT
      FROM AGRO_CRM_EMAILS
      WHERE ${conditions.join(" AND ")}
      ORDER BY SENT_AT DESC NULLS LAST
    ) WHERE ROWNUM <= ${limit}
  `, binds);

  function iso(v: Date | string | null) {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : v;
  }

  return rows.map(r => ({
    id:          Number(r.ID),
    message_id:  r.MESSAGE_ID  ? String(r.MESSAGE_ID)  : null,
    direction:   String(r.DIRECTION) as "in" | "out",
    from_addr:   r.FROM_ADDR   ? String(r.FROM_ADDR)   : null,
    to_addr:     r.TO_ADDR     ? String(r.TO_ADDR)     : null,
    subject:     r.SUBJECT     ? String(r.SUBJECT)     : null,
    body_text:   r.BODY_TEXT   ? String(r.BODY_TEXT)   : null,
    lead_id:     r.LEAD_ID     ? Number(r.LEAD_ID)     : null,
    customer_id: r.CUSTOMER_ID ? Number(r.CUSTOMER_ID) : null,
    sent_at:     iso(r.SENT_AT    as Date | string | null),
    synced_at:   iso(r.SYNCED_AT  as Date | string | null),
  }));
}
