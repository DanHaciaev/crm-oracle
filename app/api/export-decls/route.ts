import { NextRequest } from "next/server";
import { readOnly } from "@/lib/dipp-read-api";
import { listExportDecls } from "@/lib/export-decls";

export async function GET(req: NextRequest) {
  return readOnly("export-decls", () => listExportDecls(req.nextUrl.searchParams));
}
