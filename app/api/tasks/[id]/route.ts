import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, title, description, status, assigned_to, created_by, created_at
       FROM crm_user.tasks WHERE id = :1`,
      [id],
      { outFormat: 4002 }
    );
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
    }
    const r = rows[0];
    return NextResponse.json({
      id:          Number(r["ID"]),
      title:       String(r["TITLE"] ?? ""),
      description: r["DESCRIPTION"] ? String(r["DESCRIPTION"]) : null,
      status:      String(r["STATUS"] ?? ""),
      assigned_to: r["ASSIGNED_TO"] ? Number(r["ASSIGNED_TO"]) : null,
      created_by:  r["CREATED_BY"]  ? Number(r["CREATED_BY"])  : null,
      created_at:  r["CREATED_AT"] instanceof Date
        ? (r["CREATED_AT"] as Date).toISOString()
        : String(r["CREATED_AT"] ?? ""),
    });
  } finally {
    await conn.close();
  }
}