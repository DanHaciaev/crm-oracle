import { NextRequest } from "next/server";
import { withDeliveryUser } from "@/lib/deliveries-api";
import { availableSales } from "@/lib/deliveries";

// Sales documents not yet in a trip — the pool for planning.
export async function GET(req: NextRequest) {
  return withDeliveryUser(() => availableSales(req.nextUrl.searchParams));
}
