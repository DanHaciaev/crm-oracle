import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { checkDetail } from "@/lib/quality";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  return withQualityUser(async () =>
    (await checkDetail(Number(id), lang)) ?? NextResponse.json({ error: "Проверка не найдена" }, { status: 404 }));
}
