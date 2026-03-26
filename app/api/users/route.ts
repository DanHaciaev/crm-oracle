import { NextResponse } from "next/server";
import { query } from "@/lib/oracle";

interface UserRow extends Record<string, unknown> {
  ID: number;
  EMAIL: string;
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
}

export async function GET() {
  const rows = await query<UserRow>(
    `SELECT id, email, first_name, last_name FROM crm_user.users ORDER BY id ASC`
  );
  return NextResponse.json(rows.map((r) => ({
    id:         r.ID,
    email:      r.EMAIL,
    first_name: r.FIRST_NAME,
    last_name:  r.LAST_NAME,
  })));
}