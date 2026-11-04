import { NextRequest } from "next/server";
import { withUser } from "@/lib/payments-api";
import { customerLedger } from "@/lib/receivables";

// One customer: documents with paid / remaining, payments, terms.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return withUser(() => customerLedger(Number(customerId)));
}
