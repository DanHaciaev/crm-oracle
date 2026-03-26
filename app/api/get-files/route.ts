import { NextResponse } from "next/server";
import * as ftp from "basic-ftp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "taskId обязателен" }, { status: 400 });
  }

  const client = new ftp.Client();

  try {
    await client.access({
      host:     process.env.FTP_HOST!,
      user:     process.env.FTP_USER!,
      password: process.env.FTP_PASSWORD!,
      secure:   false,
    });

    const list  = await client.list();
    const files = list
      .filter((f) => f.name.startsWith(`${taskId}_`))
      .map((f) => {
        const parts     = f.name.split("_");
        const timestamp = parts[1] ? parseInt(parts[1]) : null;
        return {
          name:       f.name.replace(`${taskId}_`, "").replace(/^\d+_/, ""),
          fullName:   f.name,
          size:       f.size,
          modifiedAt: timestamp ? new Date(timestamp).toISOString() : null,
        };
      });

    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.close();
  }
}