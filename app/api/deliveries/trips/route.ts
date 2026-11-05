import { NextRequest } from "next/server";
import { withDeliveryUser } from "@/lib/deliveries-api";
import { createTrip, listTrips, parseTrip } from "@/lib/deliveries";

export async function GET(req: NextRequest) {
  return withDeliveryUser(() => listTrips(req.nextUrl.searchParams));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return withDeliveryUser(user => createTrip(parseTrip(body), user));
}
