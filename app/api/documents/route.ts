import { NextResponse } from "next/server";
import { execute, getConnection } from "@/lib/oracle";

export async function GET() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, file_name, full_name, file_size, file_type, task_id, uploaded_by, created_at
       FROM crm_user.documents ORDER BY created_at DESC`,
      [],
      { outFormat: 4002 }
    );
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    return NextResponse.json(rows.map((r) => ({
      id:          Number(r["ID"]),
      name:        String(r["FILE_NAME"] ?? ""),
      full_name:   String(r["FULL_NAME"] ?? ""),
      size:        r["FILE_SIZE"] ? Number(r["FILE_SIZE"]) : null,
      file_type:   r["FILE_TYPE"] ? String(r["FILE_TYPE"]) : null,
      task_id:     r["TASK_ID"]   ? Number(r["TASK_ID"])   : null,
      uploaded_by: r["UPLOADED_BY"] ? Number(r["UPLOADED_BY"]) : null,
      created_at:  r["CREATED_AT"] instanceof Date
        ? (r["CREATED_AT"] as Date).toISOString()
        : String(r["CREATED_AT"] ?? ""),
    })));
  } finally {
    await conn.close();
  }
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  await execute(`DELETE FROM crm_user.documents WHERE id = :1`, [id]);
  return NextResponse.json({ success: true });
}