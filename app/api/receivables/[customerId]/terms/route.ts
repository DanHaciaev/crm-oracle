import { NextRequest } from "next/server";
import { withUser } from "@/lib/payments-api";
import { saveTerms } from "@/lib/receivables";

// PUT { payment_days, credit_limit_mdl } — empty value = use the default / no limit.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const b = await req.json().catch(() => ({}));
  const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
  return withUser(user => saveTerms(Number(customerId), num(b.payment_days), num(b.credit_limit_mdl), user));
}
