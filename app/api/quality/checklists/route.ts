import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { checklists } from "@/lib/quality";

// QA checklist templates with their parameters — read-only, edited in DIPP FRUICT.
export async function GET(req: NextRequest) {
  return withQualityUser(() => checklists(parseLang(req.nextUrl.searchParams.get("lang"))));
}
