import { NextRequest } from "next/server";
import { withDeliveryUser } from "@/lib/deliveries-api";
import { setTripStatus } from "@/lib/deliveries";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withDeliveryUser(user => setTripStatus(Number(id), String(body.status ?? ""), user));
}
