import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/oracle";

type Row = Record<string, unknown>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// DIPP FRUICT's own activity journal (AGRO_ACTIVITY_LOG, Admin → «Jurnal»)
// — read-only. Access: "audit-log" view, checked in proxy.ts.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "";
  if (ISO.test(df)) { w.push("LOG_TIME >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("LOG_TIME < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  for (const [k, c] of [["actor", "ACTOR"], ["entity", "ENTITY"], ["action", "ACTION"]] as const) {
    const v = (sp.get(k) ?? "").trim();
    if (v) { w.push(`${c} = :${k}`); b[k] = v.slice(0, 200); }
  }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) { w.push("(UPPER(DESCRIPTION) LIKE :q OR TO_CHAR(ENTITY_ID) = :qid)"); b.q = `%${q.toUpperCase()}%`; b.qid = q; }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  try {
    const [rows, total, facets] = await Promise.all([
      query<Row>(`SELECT * FROM (SELECT ID, LOG_TIME, ACTOR, ACTION, ENTITY, ENTITY_ID, DESCRIPTION FROM AGRO_ACTIVITY_LOG ${where}
                  ORDER BY LOG_TIME DESC, ID DESC) WHERE ROWNUM <= 500`, b),
      query<Row>(`SELECT COUNT(*) AS N FROM AGRO_ACTIVITY_LOG ${where}`, b),
      query<Row>(`SELECT 'actor' AS K, ACTOR AS V FROM AGRO_ACTIVITY_LOG WHERE ACTOR IS NOT NULL GROUP BY ACTOR
                  UNION ALL SELECT 'entity', ENTITY FROM AGRO_ACTIVITY_LOG WHERE ENTITY IS NOT NULL GROUP BY ENTITY
                  UNION ALL SELECT 'action', ACTION FROM AGRO_ACTIVITY_LOG WHERE ACTION IS NOT NULL GROUP BY ACTION`, []),
    ]);
    const pick = (k: string) => facets.filter(f => f.K === k).map(f => String(f.V)).sort((a, z) => a.localeCompare(z));
    return NextResponse.json({
      rows: rows.map(r => ({
        id: Number(r.ID), at: r.LOG_TIME instanceof Date ? r.LOG_TIME.toISOString() : null, actor: String(r.ACTOR ?? ""),
        action: String(r.ACTION ?? ""), entity: String(r.ENTITY ?? ""), entity_id: r.ENTITY_ID == null ? null : Number(r.ENTITY_ID),
        description: String(r.DESCRIPTION ?? ""),
      })),
      total: Number(total[0]?.N ?? 0),
      actors: pick("actor"), entities: pick("entity"), actions: pick("action"),
    });
  } catch (e) {
    console.error("[audit-log/dipp]", e);
    return NextResponse.json({ error: "Ошибка загрузки журнала" }, { status: 500 });
  }
}
