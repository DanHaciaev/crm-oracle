import { NextRequest, NextResponse } from "next/server";
import { withQualityUser } from "@/lib/quality-api";
import { complaintDetail, updateComplaint } from "@/lib/quality";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withQualityUser(async () =>
    (await complaintDetail(Number(id))) ?? NextResponse.json({ error: "Претензия не найдена" }, { status: 404 }));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withQualityUser(user => updateComplaint(Number(id), body, user));
}
