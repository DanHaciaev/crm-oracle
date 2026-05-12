import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute, query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { sendText } from "@/lib/tg";

interface MessageRow {
  [key: string]: unknown;
  ID:           number;
  DIRECTION:    string;
  BODY:         string | null;
  FILE_ID:      string | null;
  FILE_TYPE:    string | null;
  STATUS:       string;
  SENT_BY_USER: number | null;
  SENT_BY_NAME: string | null;
  CREATED_AT:   Date | string | null;
}

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const rows = await query<MessageRow>(
    `SELECT m.ID, m.DIRECTION, m.BODY, m.FILE_ID, m.FILE_TYPE, m.STATUS,
            m.SENT_BY_USER, u.USERNAME AS SENT_BY_NAME, m.CREATED_AT
       FROM CRM_CHAT_MESSAGES m
       LEFT JOIN AGRO_USERS u ON u.ID = m.SENT_BY_USER
      WHERE m.APP_USER_ID = :1
      ORDER BY m.CREATED_AT ASC, m.ID ASC`,
    [appUserId]
  );

  return NextResponse.json(rows.map((r) => ({
    id:           r.ID,
    direction:    r.DIRECTION,
    body:         r.BODY,
    file_id:      r.FILE_ID,
    file_type:    r.FILE_TYPE,
    status:       r.STATUS,
    sent_by_id:   r.SENT_BY_USER,
    sent_by_name: r.SENT_BY_NAME,
    created_at:   iso(r.CREATED_AT),
  })));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as { text?: string }));
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  if (text.length > 4096) {
    return NextResponse.json({ error: "Сообщение слишком длинное (макс 4096)" }, { status: 400 });
  }

  const users = await query<{ TELEGRAM_CHAT_ID: number; STATUS: string }>(
    `SELECT TELEGRAM_CHAT_ID, STATUS FROM APP_USERS WHERE ID = :1`,
    [appUserId]
  );
  if (users.length === 0) {
    return NextResponse.json({ error: "Собеседник не найден" }, { status: 404 });
  }
  if (users[0].STATUS === "blocked") {
    return NextResponse.json({ error: "Нельзя писать заблокированному" }, { status: 400 });
  }

  // Insert as pending first (так если sendText упадёт — у нас останется запись).
  await execute(
    `INSERT INTO CRM_CHAT_MESSAGES
       (APP_USER_ID, DIRECTION, BODY, STATUS, SENT_BY_USER)
     VALUES (:1, 'out', :2, 'pending', :3)`,
    [appUserId, text, auth.id]
  );

  // Достанем ID только что вставленной строки (самой свежей out от этого юзера).
  const inserted = await query<{ ID: number }>(
    `SELECT ID FROM (
       SELECT ID FROM CRM_CHAT_MESSAGES
        WHERE APP_USER_ID = :1 AND DIRECTION = 'out'
        ORDER BY ID DESC
     ) WHERE ROWNUM = 1`,
    [appUserId]
  );
  const messageId = inserted[0]?.ID;

  try {
    const tgMsgId = await sendText(Number(users[0].TELEGRAM_CHAT_ID), text);
    await execute(
      `UPDATE CRM_CHAT_MESSAGES SET STATUS = 'sent', TG_MESSAGE_ID = :1 WHERE ID = :2`,
      [tgMsgId, messageId]
    );
    await execute(
      `UPDATE APP_USERS SET LAST_MESSAGE_AT = SYSTIMESTAMP WHERE ID = :1`,
      [appUserId]
    );
    return NextResponse.json({ success: true, message_id: messageId, tg_message_id: tgMsgId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE CRM_CHAT_MESSAGES SET STATUS = 'failed', ERROR = :1 WHERE ID = :2`,
      [errMsg.slice(0, 2000), messageId]
    );
    return NextResponse.json({ error: `Telegram отклонил: ${errMsg}` }, { status: 502 });
  }
}
