import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { blockedBatches } from "@/lib/quality";

// Blocked batches; blocking / unblocking itself is done in the warehouse section.
export async function GET(req: NextRequest) {
  return withQualityUser(() => blockedBatches(parseLang(req.nextUrl.searchParams.get("lang"))));
}
