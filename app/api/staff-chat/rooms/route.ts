import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ChannelInfoRow {
  ROOM:  string;
  LABEL: string;
}

interface UnreadRow {
  ROOM:   string;
  UNREAD: number;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const user = token ? verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // Channels this user is a member of (from DB, not hardcoded)
  const channelRows = await query<ChannelInfoRow>(`
    SELECT c.room, c.label
    FROM AGRO_CRM_STAFF_CHANNELS c
    JOIN AGRO_CRM_STAFF_CHANNEL_MEMBERS m ON m.channel = c.room AND m.user_id = :1
    WHERE c.active = 'Y'
    ORDER BY c.created_at ASC
  `, [user.id]);

  const myChannels = channelRows.map(r => ({ room: r.ROOM, label: r.LABEL }));

  // Channel unreads (JOIN against DB channels — no hardcoded IN list)
  const channelUnreadRows = await query<UnreadRow>(`
    SELECT msg.room, COUNT(1) AS unread
    FROM AGRO_CRM_STAFF_MESSAGES msg
    JOIN AGRO_CRM_STAFF_CHANNEL_MEMBERS mbr ON mbr.channel = msg.room AND mbr.user_id = :1
    JOIN AGRO_CRM_STAFF_CHANNELS ch ON ch.room = msg.room AND ch.active = 'Y'
    LEFT JOIN AGRO_CRM_STAFF_READS r ON r.room = msg.room AND r.user_id = :2
    WHERE msg.created_at > NVL(r.last_read_at,
          TO_TIMESTAMP('1970-01-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS'))
    GROUP BY msg.room
  `, [user.id, user.id]);

  // DM unreads
  const dmUnreadRows = await query<UnreadRow>(`
    SELECT m.room, COUNT(1) AS unread
    FROM AGRO_CRM_STAFF_MESSAGES m
    LEFT JOIN AGRO_CRM_STAFF_READS r ON r.room = m.room AND r.user_id = :1
    WHERE m.sender_id != :2
      AND (
        m.room LIKE 'dm:' || :3 || ':%'
        OR m.room LIKE 'dm:%:' || :4
      )
      AND m.created_at > NVL(r.last_read_at,
            TO_TIMESTAMP('1970-01-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS'))
    GROUP BY m.room
  `, [user.id, user.id, String(user.id), String(user.id)]);

  const channelUnreads: Record<string, number> = {};
  for (const r of channelUnreadRows) channelUnreads[r.ROOM] = Number(r.UNREAD);

  const dmUnreads: Record<string, number> = {};
  for (const r of dmUnreadRows) dmUnreads[r.ROOM] = Number(r.UNREAD);

  return NextResponse.json({ myChannels, channelUnreads, dmUnreads });
}
