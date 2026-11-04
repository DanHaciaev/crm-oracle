import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

const MAX_BYTES = 512 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

// GET — the logo image itself (404 when none). POST — multipart "file"
// upload, DELETE — remove. Writes need edit on "settings" (proxy.ts).
export async function GET() {
  const rows = await query<{ MIME_TYPE: string; DATA: Buffer }>(
    `SELECT MIME_TYPE, DATA FROM AGRO_CRM_COMPANY_LOGO WHERE ID = 1`);
  if (!rows.length) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(rows[0].DATA), {
    headers: { "Content-Type": rows[0].MIME_TYPE, "Cache-Control": "private, max-age=60" },
  });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const user = verifyToken(store.get("token")?.value ?? "");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Нужен PNG, JPG, SVG или WEBP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файл больше 512 КБ" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  await execute(
    `MERGE INTO AGRO_CRM_COMPANY_LOGO t USING (SELECT 1 AS ID FROM DUAL) s ON (t.ID = s.ID)
     WHEN MATCHED THEN UPDATE SET MIME_TYPE = :mime, DATA = :data, UPDATED_BY = :usr, UPDATED_AT = SYSDATE
     WHEN NOT MATCHED THEN INSERT (ID, MIME_TYPE, DATA, UPDATED_BY) VALUES (1, :mime, :data, :usr)`,
    { mime: file.type, data, usr: user?.username ?? null });
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  await execute(`DELETE FROM AGRO_CRM_COMPANY_LOGO WHERE ID = 1`);
  return NextResponse.json({ success: true });
}
