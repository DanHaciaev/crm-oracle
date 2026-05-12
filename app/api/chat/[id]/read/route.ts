import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  await execute(
    `UPDATE APP_USERS SET UNREAD_COUNT = 0 WHERE ID = :1`,
    [appUserId]
  );

  return NextResponse.json({ success: true });
}
