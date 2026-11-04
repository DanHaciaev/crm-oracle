import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { batchDetail, ActionError } from "@/lib/warehouse";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ lang }) => {
    const d = await batchDetail(Number(id), lang);
    if (!d) throw new ActionError("Партия не найдена");
    return d;
  });
}
