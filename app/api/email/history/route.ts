import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { getEmailHistory } from "@/lib/email-db";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const leadId     = sp.get("lead_id");
  const customerId = sp.get("customer_id");

  if (!leadId && !customerId)
    return NextResponse.json({ error: "Укажите lead_id или customer_id" }, { status: 400 });

  const history = await getEmailHistory({
    lead_id:     leadId     ? Number(leadId)     : undefined,
    customer_id: customerId ? Number(customerId) : undefined,
  });

  return NextResponse.json(history);
}
