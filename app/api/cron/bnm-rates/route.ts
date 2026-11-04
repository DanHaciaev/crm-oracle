import { NextResponse } from "next/server";
import { fetchBnm } from "@/lib/rates";

// Daily BNM rates (EUR/USD/RON → MDL). DIPP FRUICT already loads them at 09:00;
// this is the CRM's own copy of that job (e.g. on a server where DIPP FRUICT
// isn't running) — same natural key, so running both is harmless.
// Access: x-cron-secret or an admin (proxy.ts).
export async function GET() {
  try {
    return NextResponse.json(await fetchBnm());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
