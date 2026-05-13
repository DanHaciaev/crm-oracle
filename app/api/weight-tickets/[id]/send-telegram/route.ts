import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { generateActPdf } from "@/lib/pdf-act";
import { sendDocument } from "@/lib/tg";

interface HeaderRow {
  [key: string]: unknown;
  ID: number;
  TICKET_NUMBER: string;
  TICKET_DATE: Date | string | null;
  STATUS: string;
  OPERATOR: string | null;
  NOTES: string | null;
  CREATED_AT: Date | string | null;
  CUSTOMER_ID: number | null;
  CUSTOMER_NAME: string | null;
  WAREHOUSE_NAME: string | null;
  SALES_DOC_NUMBER: string | null;
}

interface LineRow {
  [key: string]: unknown;
  ID: number;
  LINE_NO: number | null;
  CRATE_CODE: string | null;
  BATCH_NUMBER: string | null;
  ITEM_NAME: string | null;
  ITEM_NAME_RO: string | null;
  GROSS_KG: number | null;
  TARE_KG: number | null;
  NET_KG: number | null;
}

interface AppUserRow {
  [key: string]: unknown;
  ID: number;
  TELEGRAM_CHAT_ID: number;
  STATUS: string;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function dateToIso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isFinite(ticketId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  // ---- 1. Загружаем шапку акта + клиента ----
  const headers = await query<HeaderRow>(`
    SELECT
      t.ID, t.TICKET_NUMBER, t.TICKET_DATE, t.STATUS,
      t.OPERATOR, t.NOTES, t.CREATED_AT, t.CUSTOMER_ID,
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
    return NextResponse.json({ error: "Акт не найден" }, { status: 404 });
  }
  const h = headers[0];

  if (!h.CUSTOMER_ID) {
    return NextResponse.json({ error: "Акт не привязан к клиенту" }, { status: 400 });
  }

  // ---- 2. Ищем привязанного Telegram-юзера ----
  const appUsers = await query<AppUserRow>(`
    SELECT ID, TELEGRAM_CHAT_ID, STATUS
      FROM AGRO_CRM_APP_USERS
     WHERE CUSTOMER_ID = :1 AND STATUS = 'linked'
  `, [h.CUSTOMER_ID]);

  if (appUsers.length === 0) {
    return NextResponse.json({ error: "Клиент не привязан к Telegram — некому отправлять" }, { status: 400 });
  }
  const appUser = appUsers[0];

  // ---- 3. Строки акта ----
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

  const actData = {
    id: h.ID,
    ticket_number:    h.TICKET_NUMBER,
    ticket_date:      dateToIso(h.TICKET_DATE),
    status:           h.STATUS,
    operator:         h.OPERATOR,
    customer_name:    h.CUSTOMER_NAME,
    warehouse_name:   h.WAREHOUSE_NAME,
    sales_doc_number: h.SALES_DOC_NUMBER,
    created_at:       dateToIso(h.CREATED_AT),
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
  };

  // ---- 4. Генерим PDF ----
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateActPdf(actData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Не удалось сгенерировать PDF: ${msg}` }, { status: 500 });
  }

  const filename = `act_${h.TICKET_NUMBER.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const caption  = `📄 <b>Весовой акт / Tichet de cântărire</b>\n№ ${h.TICKET_NUMBER}\nКлиент: ${h.CUSTOMER_NAME ?? "—"}`;

  // ---- 5. Отправляем в Telegram ----
  let tgMessageId: number;
  try {
    tgMessageId = await sendDocument(Number(appUser.TELEGRAM_CHAT_ID), pdfBuffer, filename, caption);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Telegram отклонил отправку: ${msg}` }, { status: 502 });
  }

  // ---- 6. Логируем в чат + события + outbox (best-effort) ----
  try {
    await execute(
      `INSERT INTO AGRO_CRM_CHAT_MESSAGES
         (APP_USER_ID, DIRECTION, BODY, TG_MESSAGE_ID, FILE_ID, FILE_TYPE, STATUS, SENT_BY_USER)
       VALUES (:1, 'out', :2, :3, :4, 'document', 'sent', :5)`,
      [
        appUser.ID,
        `📄 Акт № ${h.TICKET_NUMBER}`,
        tgMessageId,
        filename,
        user.id ?? null,
      ]
    );
    await execute(
      `INSERT INTO AGRO_CRM_APP_USER_EVENTS (APP_USER_ID, EVENT_TYPE, PAYLOAD, ACTOR_USER)
       VALUES (:1, 'act_sent', :2, :3)`,
      [appUser.ID, `ticket_id=${ticketId} ticket_number=${h.TICKET_NUMBER}`, user.id ?? null]
    );
    await execute(
      `UPDATE AGRO_CRM_APP_USERS SET LAST_MESSAGE_AT = SYSTIMESTAMP WHERE ID = :1`,
      [appUser.ID]
    );
  } catch (err) {
    console.error("[send-telegram] post-send logging failed:", err);
  }

  return NextResponse.json({
    success:       true,
    tg_message_id: tgMessageId,
    customer:      h.CUSTOMER_NAME,
  });
}
