import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (LOSS_REASON VARCHAR2(500))'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  columnsReady = true;
}

interface StatusRow {
  [key: string]: unknown;
  STATUS: string;
  CNT: number;
}

interface ReasonRow {
  [key: string]: unknown;
  LOSS_REASON: string | null;
  CNT: number;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureColumns();

  const [statusRows, reasonRows] = await Promise.all([
    query<StatusRow>(`
      SELECT STATUS, COUNT(*) AS CNT
      FROM AGRO_CRM_LEADS
      WHERE STATUS IN ('won', 'lost')
      GROUP BY STATUS
    `),
    query<ReasonRow>(`
      SELECT LOSS_REASON, COUNT(*) AS CNT
      FROM AGRO_CRM_LEADS
      WHERE STATUS = 'lost'
      GROUP BY LOSS_REASON
      ORDER BY CNT DESC
    `),
  ]);

  const won  = Number(statusRows.find(r => r.STATUS === "won")?.CNT  ?? 0);
  const lost = Number(statusRows.find(r => r.STATUS === "lost")?.CNT ?? 0);
  const total = won + lost;
  const win_rate = total > 0 ? Math.round((won / total) * 100) : 0;

  const by_reason = reasonRows.map(r => ({
    reason: r.LOSS_REASON ?? "other",
    count:  Number(r.CNT),
  }));

  return NextResponse.json({ won, lost, total, win_rate, by_reason });
}
