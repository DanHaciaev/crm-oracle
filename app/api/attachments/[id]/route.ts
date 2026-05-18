import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { deleteFromS3, getPresignedUrl } from "@/lib/s3";

interface AttRow {
  [key: string]: unknown;
  ID: number; S3_KEY: string; FILE_NAME: string; UPLOADED_BY: string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const attId  = Number(id);
  if (!Number.isFinite(attId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const rows = await query<AttRow>(
    `SELECT ID, S3_KEY, FILE_NAME, UPLOADED_BY FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`,
    [attId]
  );
  if (!rows.length) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const url = await getPresignedUrl(String(rows[0].S3_KEY), String(rows[0].FILE_NAME));
  return NextResponse.redirect(url);
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

  const rows = await query<AttRow>(
    `SELECT ID, S3_KEY, FILE_NAME, UPLOADED_BY FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`,
    [attId]
  );
  if (!rows.length) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const att = rows[0];
  if (user.role !== "admin" && att.UPLOADED_BY !== user.username)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  await deleteFromS3(String(att.S3_KEY));
  await execute(`DELETE FROM AGRO_CRM_ATTACHMENTS WHERE ID = :1`, [attId]);

  return NextResponse.json({ success: true });
}
