import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { inspections } from "@/lib/quality";

// Acceptance inspections of batches — read-only, scored in DIPP FRUICT.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return withQualityUser(() => inspections(sp, parseLang(sp.get("lang"))));
}
