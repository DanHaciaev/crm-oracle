import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { unblockBatch } from "@/lib/warehouse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, async ({ username }) => {
    const status = await unblockBatch(Number(id), String(body.resolution ?? "").trim().slice(0, 500), username);
    return { success: true, status };
  });
}
