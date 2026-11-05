import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQuoteUser } from "@/lib/quotes-api";
import { quoteDetail, updateQuote } from "@/lib/quotes";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  return withQuoteUser(async () =>
    (await quoteDetail(Number(id), lang)) ?? NextResponse.json({ error: "КП не найдено" }, { status: 404 }));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withQuoteUser(user => updateQuote(Number(id), body, user));
}
