import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConnection, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import oracledb from "oracledb";

interface AttRow {
  ID: number;
  CONTENT: Buffer | null;
  FILE_NAME: string;
  FILE_TYPE: string | null;
  UPLOADED_BY: string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const attId   = Number(id);
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  if (!Number.isFinite(attId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const conn = await getConnection();
  try {
    const result = await conn.execute<AttRow>(
      `SELECT ID, CONTENT, FILE_NAME, FILE_TYPE, UPLOADED_BY
       FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`,
      [attId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    if (!row)         return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    if (!row.CONTENT) return NextResponse.json({ error: "Файл недоступен" }, { status: 404 });

    const buf = Buffer.isBuffer(row.CONTENT) ? row.CONTENT : Buffer.from(row.CONTENT as unknown as ArrayBuffer);

    const disposition = preview
      ? `inline; filename="${encodeURIComponent(String(row.FILE_NAME))}"`
      : `attachment; filename="${encodeURIComponent(String(row.FILE_NAME))}"`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":        row.FILE_TYPE || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length":      String(buf.length),
      },
    });
  } finally {
    await conn.close();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const attId  = Number(id);
  if (!Number.isFinite(attId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const conn = await getConnection();
  let uploadedBy: string | null = null;
  try {
    const result = await conn.execute<{ UPLOADED_BY: string | null }>(
      `SELECT UPLOADED_BY FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`,
      [attId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    uploadedBy = row.UPLOADED_BY;
  } finally {
    await conn.close();
  }

  if (user.role !== "admin" && uploadedBy !== user.username)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  await execute(`DELETE FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`, [attId]);
  return NextResponse.json({ success: true });
}
