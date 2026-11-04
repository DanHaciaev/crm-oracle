import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { blockBatch, ActionError } from "@/lib/warehouse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, async ({ username }) => {
    const reason = String(body.reason ?? "").trim().slice(0, 500);
    if (!reason) throw new ActionError("Укажите причину блокировки");
    await blockBatch(Number(id), reason, username);
    return { success: true, status: "blocked" };
  });
}
