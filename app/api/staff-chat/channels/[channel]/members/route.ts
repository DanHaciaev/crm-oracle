import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function getAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

async function isActiveChannel(room: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM AGRO_CRM_STAFF_CHANNELS WHERE room = :1 AND active = 'Y'`,
    [room]
  );
  return rows.length > 0;
}

interface MemberRow extends Record<string, unknown> {
  ID:         number;
  USERNAME:   string;
  FIRST_NAME: string | null;
  LAST_NAME:  string | null;
  ROLE:       string;
  ADDED_AT:   Date | string;
}

// GET — list members of a channel
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { channel } = await params;
  if (!await isActiveChannel(channel)) {
    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  }

  const rows = await query<MemberRow>(`
    SELECT u.id, u.username, u.first_name, u.last_name, u.role, m.added_at
    FROM AGRO_CRM_STAFF_CHANNEL_MEMBERS m
    JOIN AGRO_USERS u ON u.id = m.user_id
    WHERE m.channel = :1
    ORDER BY u.username ASC
  `, [channel]);

  return NextResponse.json(rows.map(r => ({
    id:         r.ID,
    username:   r.USERNAME,
    first_name: r.FIRST_NAME,
    last_name:  r.LAST_NAME,
    role:       r.ROLE,
    added_at:   r.ADDED_AT instanceof Date ? r.ADDED_AT.toISOString() : String(r.ADDED_AT ?? ""),
  })));
}

// POST — add a user to channel (admin only)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

  const { channel } = await params;
  if (!await isActiveChannel(channel)) {
    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

  try {
    await execute(
      `INSERT INTO AGRO_CRM_STAFF_CHANNEL_MEMBERS (channel, user_id, added_by)
       VALUES (:1, :2, :3)`,
      [channel, userId, user.id]
    );
  } catch (e: unknown) {
    // ORA-00001: unique constraint violated — already a member
    if ((e as { errorNum?: number }).errorNum === 1) {
      return NextResponse.json({ success: true });
    }
    throw e;
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove a user from channel (admin only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

  const { channel } = await params;
  if (!await isActiveChannel(channel)) {
    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

  await execute(
    `DELETE FROM AGRO_CRM_STAFF_CHANNEL_MEMBERS WHERE channel = :1 AND user_id = :2`,
    [channel, userId]
  );

  return NextResponse.json({ success: true });
}
