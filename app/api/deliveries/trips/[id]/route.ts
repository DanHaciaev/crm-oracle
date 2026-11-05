import { NextRequest, NextResponse } from "next/server";
import { withDeliveryUser } from "@/lib/deliveries-api";
import { tripDetail, updateTrip } from "@/lib/deliveries";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withDeliveryUser(async () =>
    (await tripDetail(Number(id))) ?? NextResponse.json({ error: "Рейс не найден" }, { status: 404 }));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withDeliveryUser(user => updateTrip(Number(id), body, user));
}
