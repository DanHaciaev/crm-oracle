import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function getAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function isDmRoom(room: string, userId: number): boolean {
  const m = room.match(/^dm:(\d+):(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a < b && (a === userId || b === userId);
}

async function isActiveChannel(room: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM AGRO_CRM_STAFF_CHANNELS WHERE room = :1 AND active = 'Y'`,
    [room]
  );
  return rows.length > 0;
}

async function checkChannelMembership(channel: string, userId: number): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM AGRO_CRM_STAFF_CHANNEL_MEMBERS WHERE channel = :1 AND user_id = :2`,
    [channel, userId]
  );
  return rows.length > 0;
}

interface MsgRow {
  ID:                number;
  SENDER_ID:         number;
  BODY:              string;
  CREATED_AT:        Date | string;
  SENDER_USERNAME:   string;
  SENDER_FIRST_NAME: string | null;
  SENDER_LAST_NAME:  string | null;
}

export async function GET(request: Request) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room") ?? "general";

  if (isDmRoom(room, user.id)) {
    // DM — user is implicitly allowed
  } else if (await isActiveChannel(room)) {
    if (!await checkChannelMembership(room, user.id)) {
      return NextResponse.json({ error: "Вы не являетесь участником этого канала" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Недопустимый канал" }, { status: 400 });
  }

  const rows = await query<MsgRow>(`
    SELECT id, sender_id, body, created_at, sender_username, sender_first_name, sender_last_name
    FROM (
      SELECT
        m.id,
        m.sender_id,
        m.body,
        m.created_at,
        u.username    AS sender_username,
        u.first_name  AS sender_first_name,
        u.last_name   AS sender_last_name
      FROM (
        SELECT id, sender_id, body, created_at
        FROM AGRO_CRM_STAFF_MESSAGES
        WHERE room = :1
        ORDER BY created_at DESC
      ) m
      LEFT JOIN AGRO_USERS u ON u.id = m.sender_id
      WHERE ROWNUM <= 100
    )
    ORDER BY created_at ASC
  `, [room]);

  // Mark as read
  await execute(`
    MERGE INTO AGRO_CRM_STAFF_READS r
    USING (SELECT 1 FROM DUAL) d
    ON (r.user_id = :1 AND r.room = :2)
    WHEN MATCHED THEN UPDATE SET last_read_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (user_id, room) VALUES (:3, :4)
  `, [user.id, room, user.id, room]);

  return NextResponse.json(rows.map(r => ({
    id:                 r.ID,
    sender_id:          r.SENDER_ID,
    sender_username:    r.SENDER_USERNAME ?? "",
    sender_first_name:  r.SENDER_FIRST_NAME,
    sender_last_name:   r.SENDER_LAST_NAME,
    body:               r.BODY,
    created_at:         r.CREATED_AT instanceof Date
                          ? r.CREATED_AT.toISOString()
                          : String(r.CREATED_AT ?? ""),
  })));
}

export async function POST(request: Request) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { room, body } = await request.json();

  if (!room || !body?.trim()) {
    return NextResponse.json({ error: "Комната и текст обязательны" }, { status: 400 });
  }

  if (isDmRoom(room, user.id)) {
    // DM — allowed
  } else if (await isActiveChannel(room)) {
    if (!await checkChannelMembership(room, user.id)) {
      return NextResponse.json({ error: "Вы не являетесь участником этого канала" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Недопустимый канал" }, { status: 400 });
  }

  await execute(
    `INSERT INTO AGRO_CRM_STAFF_MESSAGES (id, sender_id, room, body)
     VALUES (AGRO_STAFF_MSG_SEQ.NEXTVAL, :1, :2, :3)`,
    [user.id, room, body.trim()]
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { messageId } = await request.json();
  if (!messageId) return NextResponse.json({ error: "messageId обязателен" }, { status: 400 });

  const rows = await query<{ SENDER_ID: number }>(
    `SELECT sender_id FROM AGRO_CRM_STAFF_MESSAGES WHERE id = :1`,
    [messageId]
  );
  if (rows.length === 0) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  if (rows[0].SENDER_ID !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав на удаление" }, { status: 403 });
  }

  await execute(`DELETE FROM AGRO_CRM_STAFF_MESSAGES WHERE id = :1`, [messageId]);

  return NextResponse.json({ success: true });
}
