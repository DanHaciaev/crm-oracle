import { withUser } from "@/lib/payments-api";
import { receivablesSummary } from "@/lib/receivables";

// Debts per customer and currency, with aging.
export const GET = () => withUser(() => receivablesSummary());
