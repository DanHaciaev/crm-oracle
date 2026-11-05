import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { listChecks } from "@/lib/quality";

// QA checks — read-only, they are performed in DIPP FRUICT.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return withQualityUser(() => listChecks(sp, parseLang(sp.get("lang"))));
}
