import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface UserRow {
  ID: number;
  USERNAME: string;
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  ROLE: string;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const user = token ? verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<UserRow>(`
    SELECT id, username, first_name, last_name, role
    FROM AGRO_USERS
    WHERE active = 'Y'
    ORDER BY username ASC
  `);

  return NextResponse.json(rows.map(r => ({
    id:         r.ID,
    username:   r.USERNAME,
    first_name: r.FIRST_NAME,
    last_name:  r.LAST_NAME,
    role:       r.ROLE,
  })));
}
