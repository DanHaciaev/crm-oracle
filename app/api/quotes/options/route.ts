import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQuoteUser } from "@/lib/quotes-api";
import { priceHints, quoteLookups } from "@/lib/quotes";

// Form pickers; with ?currency=… — price hints per item (last price of this
// customer / anybody) from DIPP FRUICT sales in that currency.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cur = (sp.get("currency") ?? "").toUpperCase();
  if (/^[A-Z]{3}$/.test(cur)) {
    const cust = Number(sp.get("customer_id"));
    return withQuoteUser(() => priceHints(cust > 0 ? cust : null, cur));
  }
  return withQuoteUser(() => quoteLookups(parseLang(sp.get("lang"))));
}
