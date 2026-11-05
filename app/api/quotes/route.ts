import { NextRequest } from "next/server";
import { withQuoteUser } from "@/lib/quotes-api";
import { createQuote, listQuotes, parseQuote } from "@/lib/quotes";

export async function GET(req: NextRequest) {
  return withQuoteUser(() => listQuotes(req.nextUrl.searchParams));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return withQuoteUser(user => createQuote(parseQuote(body), user));
}
