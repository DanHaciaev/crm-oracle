import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function getAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

interface ChannelRow {
  ROOM:       string;
  LABEL:      string;
  CREATED_AT: Date | string;
  ACTIVE:     string;
}

// GET — list all active channels (visible to any authenticated user)
export async function GET() {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<ChannelRow>(`
    SELECT room, label, created_at, active
    FROM AGRO_CRM_STAFF_CHANNELS
    WHERE active = 'Y'
    ORDER BY created_at ASC
  `);

  return NextResponse.json(rows.map(r => ({
    room:       r.ROOM,
    label:      r.LABEL,
    created_at: r.CREATED_AT instanceof Date ? r.CREATED_AT.toISOString() : String(r.CREATED_AT ?? ""),
  })));
}

// POST — create a new channel (admin only)
export async function POST(request: Request) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

  const { label } = await request.json();
  if (!label?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 });

  // Generate unique room ID using sequence
  const seqRows = await query<{ NEXTVAL: number }>(`SELECT AGRO_STAFF_CH_SEQ.NEXTVAL AS NEXTVAL FROM DUAL`);
  const room = `ch${seqRows[0].NEXTVAL}`;

  await execute(
    `INSERT INTO AGRO_CRM_STAFF_CHANNELS (room, label, created_by) VALUES (:1, :2, :3)`,
    [room, label.trim(), user.id]
  );

  // Add creator as first member
  await execute(
    `INSERT INTO AGRO_CRM_STAFF_CHANNEL_MEMBERS (channel, user_id, added_by) VALUES (:1, :2, :3)`,
    [room, user.id, user.id]
  );

  return NextResponse.json({ room, label: label.trim() });
}

// DELETE — deactivate a channel (admin only)
export async function DELETE(request: Request) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

  const { room } = await request.json();
  if (!room) return NextResponse.json({ error: "room обязателен" }, { status: 400 });

  // Prevent deleting the general channel
  if (room === "general") {
    return NextResponse.json({ error: "Нельзя удалить основной канал" }, { status: 400 });
  }

  await execute(
    `UPDATE AGRO_CRM_STAFF_CHANNELS SET active = 'N' WHERE room = :1`,
    [room]
  );

  return NextResponse.json({ success: true });
}
