import { NextResponse } from "next/server";
import * as ftp from "basic-ftp";

export async function DELETE(request: Request) {
  const { fileName } = await request.json();

  if (!fileName) {
    return NextResponse.json({ error: "fileName обязателен" }, { status: 400 });
  }

  const client = new ftp.Client();

  try {
    await client.access({
      host:     process.env.FTP_HOST!,
      user:     process.env.FTP_USER!,
      password: process.env.FTP_PASSWORD!,
      secure:   false,
    });

    await client.remove(fileName);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.close();
  }
}