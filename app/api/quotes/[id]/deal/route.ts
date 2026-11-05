import { NextRequest } from "next/server";
import { withQuoteUser } from "@/lib/quotes-api";
import { createDealFromQuote } from "@/lib/quotes";

// Turn the quote into a deal (a lead in the pipeline) and link them.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withQuoteUser(user => createDealFromQuote(Number(id), user));
}
