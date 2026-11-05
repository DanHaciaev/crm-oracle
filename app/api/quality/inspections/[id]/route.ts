import { NextRequest } from "next/server";
import { withQualityUser } from "@/lib/quality-api";
import { inspectionValues } from "@/lib/quality";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withQualityUser(() => inspectionValues(Number(id)));
}
