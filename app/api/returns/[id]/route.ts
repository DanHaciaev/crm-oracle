import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { returnDetail } from "@/lib/returns";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await returnDetail(Number(id), parseLang(req.nextUrl.searchParams.get("lang")));
  if (!d) return NextResponse.json({ error: "Возврат не найден" }, { status: 404 });
  return NextResponse.json(d);
}
