import { NextRequest, NextResponse } from "next/server";
import { fetchBnm } from "@/lib/rates";

// POST { date? } — load the official BNM rates for a day (default today).
// Needs edit on "settings" (proxy.ts).
export async function POST(req: NextRequest) {
  const { date } = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await fetchBnm(typeof date === "string" ? date : undefined));
  } catch (e) {
    return NextResponse.json({ error: `Не удалось загрузить курсы BNM: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
