import { NextRequest, NextResponse } from "next/server";
import { listRates } from "@/lib/rates";

// Exchange rates X → MDL by day (reference data, readable by every role).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  return NextResponse.json(await listRates(d("date_from"), d("date_to")));
}
