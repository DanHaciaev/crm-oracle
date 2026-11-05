import { NextRequest } from "next/server";
import { withQuoteUser } from "@/lib/quotes-api";
import { duplicateQuote } from "@/lib/quotes";

// Copy the quote into a new draft dated today.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withQuoteUser(user => duplicateQuote(Number(id), user));
}
