import { NextRequest } from "next/server";
import { withDeliveryUser } from "@/lib/deliveries-api";
import { updateStop } from "@/lib/deliveries";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; stopId: string }> }) {
  const { id, stopId } = await params;
  const body = await req.json().catch(() => ({}));
  return withDeliveryUser(user => updateStop(Number(id), Number(stopId), body, user));
}
