import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { randomUUID } from "crypto";

interface AttRow {
  [key: string]: unknown;
  ID: number; ENTITY_TYPE: string; ENTITY_ID: number;
  FILE_NAME: string; FILE_TYPE: string | null; FILE_SIZE: number | null;
  S3_KEY: string; UPLOADED_BY: string | null; UPLOADED_AT: Date | string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

function mapRow(r: AttRow) {
  return {
    id:          Number(r.ID),
    entity_type: String(r.ENTITY_TYPE),
    entity_id:   Number(r.ENTITY_ID),
    file_name:   String(r.FILE_NAME),
    file_type:   r.FILE_TYPE  ? String(r.FILE_TYPE)  : null,
    file_size:   r.FILE_SIZE  ? Number(r.FILE_SIZE)  : null,
    s3_key:      String(r.S3_KEY),
    uploaded_by: r.UPLOADED_BY ? String(r.UPLOADED_BY) : null,
    uploaded_at: iso(r.UPLOADED_AT as Date | string | null),
  };
}

const VALID_ENTITY_TYPES = new Set(["customer", "task"]);
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const entityType = sp.get("entity_type");
  const entityId   = sp.get("entity_id");

  if (!entityType || !VALID_ENTITY_TYPES.has(entityType) || !entityId)
    return NextResponse.json({ error: "entity_type и entity_id обязательны" }, { status: 400 });

  const rows = await query<AttRow>(`
    SELECT * FROM (
      SELECT ID, ENTITY_TYPE, ENTITY_ID, FILE_NAME, FILE_TYPE, FILE_SIZE,
             S3_KEY, UPLOADED_BY, UPLOADED_AT
      FROM AGRO_CRM_ATTACHMENTS
      WHERE ENTITY_TYPE = :1 AND ENTITY_ID = :2
      ORDER BY UPLOADED_AT DESC
    ) WHERE ROWNUM <= 100
  `, [entityType, Number(entityId)]);

  return NextResponse.json(rows.map(mapRow));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const formData   = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });

  const file       = formData.get("file") as File | null;
  const entityType = String(formData.get("entity_type") ?? "");
  const entityId   = Number(formData.get("entity_id"));

  if (!file)                              return NextResponse.json({ error: "file обязателен" },         { status: 400 });
  if (!VALID_ENTITY_TYPES.has(entityType)) return NextResponse.json({ error: "Неверный entity_type" },  { status: 400 });
  if (!Number.isFinite(entityId))          return NextResponse.json({ error: "Неверный entity_id" },    { status: 400 });
  if (file.size > MAX_SIZE_BYTES)          return NextResponse.json({ error: "Файл больше 20 МБ" },     { status: 413 });

  const ext    = file.name.includes(".") ? file.name.split(".").pop() : "";
  const s3Key  = `crm/${entityType}s/${entityId}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadToS3(s3Key, buffer, file.type || "application/octet-stream");

  await execute(`
    INSERT INTO AGRO_CRM_ATTACHMENTS
      (ENTITY_TYPE, ENTITY_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, S3_KEY, UPLOADED_BY)
    VALUES (:1, :2, :3, :4, :5, :6, :7)
  `, [
    entityType,
    entityId,
    file.name,
    file.type || null,
    file.size,
    s3Key,
    user.username,
  ]);

  const rows = await query<AttRow>(`
    SELECT ID, ENTITY_TYPE, ENTITY_ID, FILE_NAME, FILE_TYPE, FILE_SIZE,
           S3_KEY, UPLOADED_BY, UPLOADED_AT
    FROM AGRO_CRM_ATTACHMENTS
    WHERE S3_KEY = :1
  `, [s3Key]);

  return NextResponse.json(rows[0] ? mapRow(rows[0]) : { success: true }, { status: 201 });
}
