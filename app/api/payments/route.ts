import { NextRequest } from "next/server";
import { withUser } from "@/lib/payments-api";
import { addPayment, listPayments, parsePayment, METHODS } from "@/lib/receivables";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const method = sp.get("method"), status = sp.get("status");
  return withUser(() => listPayments({
    date_from: d("date_from"), date_to: d("date_to"),
    customer_id: Number(sp.get("customer_id")) > 0 ? Number(sp.get("customer_id")) : null,
    method: method && (METHODS as readonly string[]).includes(method) ? method : null,
    status: status === "active" || status === "cancelled" ? status : null,
    q: (sp.get("q") ?? "").trim().slice(0, 60) || null,
  }));
}

// POST — register a payment (linked to a sales document or on account).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return withUser(user => addPayment(parsePayment(b), user));
}
