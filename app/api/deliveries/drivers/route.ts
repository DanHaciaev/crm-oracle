import { withDeliveryUser } from "@/lib/deliveries-api";
import { driversOverview } from "@/lib/deliveries";

export async function GET() {
  return withDeliveryUser(() => driversOverview());
}
