import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";

export async function GET() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, email, first_name, last_name FROM crm_user.users ORDER BY id ASC`,
      [],
      { outFormat: 4002 }
    );
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    return NextResponse.json(rows.map((r) => ({
      id:         Number(r["ID"]),
      email:      String(r["EMAIL"] ?? ""),
      first_name: r["FIRST_NAME"] ? String(r["FIRST_NAME"]) : null,
      last_name:  r["LAST_NAME"]  ? String(r["LAST_NAME"])  : null,
    })));
  } finally {
    await conn.close();
  }
}