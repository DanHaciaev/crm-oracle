import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { acknowledgeAlert } from "@/lib/warehouse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ username }) => {
    await acknowledgeAlert(Number(id), username);
    return { success: true };
  });
}
