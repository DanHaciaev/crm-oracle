import { NextRequest } from "next/server";
import { withQuoteUser } from "@/lib/quotes-api";
import { setQuoteStatus } from "@/lib/quotes";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withQuoteUser(user => setQuoteStatus(Number(id), body, user));
}
