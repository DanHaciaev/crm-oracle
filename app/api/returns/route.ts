import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { listReturns, parseReturnFilters } from "@/lib/returns";

// Returns list (read-only — returns are created in DIPP FRUICT). Access is
// checked in proxy.ts ("returns" or "sales" view).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await listReturns(parseReturnFilters(sp), parseLang(sp.get("lang"))));
  } catch (e) {
    console.error("[returns]", e);
    return NextResponse.json({ error: "Ошибка загрузки возвратов" }, { status: 500 });
  }
}
