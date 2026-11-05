import { withDeliveryUser } from "@/lib/deliveries-api";
import { vehiclesOverview } from "@/lib/deliveries";

// Vehicles (DIPP FRUICT reference data) with their trips and shipments.
export async function GET() {
  return withDeliveryUser(() => vehiclesOverview());
}
