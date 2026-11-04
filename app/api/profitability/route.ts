import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { parseProfitFilters, profitability } from "@/lib/profitability";

// Section access ("profitability", admin-only by default) is checked in proxy.ts.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await profitability(parseProfitFilters(sp), parseLang(sp.get("lang"))));
  } catch (e) {
    console.error("[profitability]", e);
    return NextResponse.json({ error: "Ошибка формирования отчёта" }, { status: 500 });
  }
}
