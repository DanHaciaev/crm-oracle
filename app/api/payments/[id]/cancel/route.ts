import { NextRequest } from "next/server";
import { withUser } from "@/lib/payments-api";
import { cancelPayment } from "@/lib/receivables";

// POST { reason } — payments are never deleted, only cancelled.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  return withUser(user => cancelPayment(Number(id), String(b.reason ?? ""), user));
}
