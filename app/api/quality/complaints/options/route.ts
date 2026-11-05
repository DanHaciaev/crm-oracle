import { NextRequest } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQualityUser } from "@/lib/quality-api";
import { complaintLookups, complaintOptions } from "@/lib/quality";

// Complaint form pickers: without customer_id — customers + staff; with it —
// that customer's sales documents and the batches shipped in each.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cust = Number(sp.get("customer_id"));
  return withQualityUser(() => cust > 0 ? complaintOptions(cust, parseLang(sp.get("lang"))) : complaintLookups());
}
