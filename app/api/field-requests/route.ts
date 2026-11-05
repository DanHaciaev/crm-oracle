import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { readOnly } from "@/lib/dipp-read-api";
import { listFieldRequests } from "@/lib/field-requests";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return readOnly("field-requests", () => listFieldRequests(sp, parseLang(sp.get("lang"))));
}
