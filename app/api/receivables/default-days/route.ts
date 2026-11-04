import { NextRequest } from "next/server";
import { withUser } from "@/lib/payments-api";
import { saveDefaultDays } from "@/lib/receivables";

// PUT { days } — default payment term for customers without their own.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return withUser(user => saveDefaultDays(Number(b.days), user));
}
