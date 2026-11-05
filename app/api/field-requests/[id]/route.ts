import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { readOnly } from "@/lib/dipp-read-api";
import { fieldRequestLines } from "@/lib/field-requests";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return readOnly("field-requests", () => fieldRequestLines(Number(id), parseLang(req.nextUrl.searchParams.get("lang"))));
}
