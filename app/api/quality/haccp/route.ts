import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { haccp } from "@/lib/quality";

// HACCP plans, CCPs and measurements — read-only, recorded in DIPP FRUICT.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return withQualityUser(() => haccp(sp, parseLang(sp.get("lang"))));
}
