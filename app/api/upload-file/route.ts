import { NextResponse } from "next/server";
import * as ftp from "basic-ftp";
import { Readable } from "stream";
import { execute } from "@/lib/oracle";

function getFileType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext!)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc","docx"].includes(ext!)) return "word";
  if (["xls","xlsx"].includes(ext!)) return "excel";
  if (["zip","rar","7z"].includes(ext!)) return "archive";
  if (["mp4","mov","avi"].includes(ext!)) return "video";
  if (["mp3","wav"].includes(ext!)) return "audio";
  return "other";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file     = formData.get("file") as File;
  const taskId   = formData.get("taskId") as string;
  const userId   = formData.get("userId") as string;

  if (!file || !taskId) {
    return NextResponse.json({ error: "Файл и taskId обязательны" }, { status: 400 });
  }

  const bytes    = await file.arrayBuffer();
  const buffer   = Buffer.from(bytes);
  const fileName = `${taskId}_${Date.now()}_${file.name}`;

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host:     process.env.FTP_HOST!,
      user:     process.env.FTP_USER!,
      password: process.env.FTP_PASSWORD!,
      secure:   false,
    });

    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, fileName);

    // Сохраняем метаданные в Oracle
    await execute(
      `INSERT INTO crm_user.documents (file_name, full_name, file_size, file_type, task_id, uploaded_by)
       VALUES (:1, :2, :3, :4, :5, :6)`,
      [file.name, fileName, file.size, getFileType(file.name), parseInt(taskId), userId || null]
    );

    return NextResponse.json({ success: true, fileName });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.close();
  }
}