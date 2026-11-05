import { NextRequest } from "next/server";
import { withQualityUser } from "@/lib/quality-api";
import { createComplaint, listComplaints, parseComplaint, parseComplaintFilters } from "@/lib/quality";

export async function GET(req: NextRequest) {
  return withQualityUser(() => listComplaints(parseComplaintFilters(req.nextUrl.searchParams)));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return withQualityUser(user => createComplaint(parseComplaint(body), user));
}
