import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { parseLang } from "@/lib/documents/common";
import { REPORTS, parseFilters } from "@/lib/reports";
import { buildTable, toCsv, toXlsx } from "@/lib/reports/export";
import { REPORT_TITLES } from "@/lib/reports/labels";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

// The on-screen preview is capped; the downloaded file always has every row.
const PREVIEW_LIMIT = 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { type } = await params;
  const def = REPORTS[type];
  if (!def) return NextResponse.json({ error: "Неизвестный отчёт" }, { status: 404 });

  const sp     = req.nextUrl.searchParams;
  const lang   = parseLang(sp.get("lang"));
  const format = sp.get("format") ?? "json";
  const title  = REPORT_TITLES[lang][type] ?? type;

  try {
    const table = buildTable(def, await def.run(parseFilters(sp), lang), lang);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${type}_${stamp}`;

    if (format === "xlsx") {
      const buf = await toXlsx(table, title, lang);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        },
      });
    }
    if (format === "csv") {
      return new NextResponse(toCsv(table, lang), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }
    return NextResponse.json({
      title,
      columns:   table.columns,
      rows:      table.rows.slice(0, PREVIEW_LIMIT),
      total:     table.rows.length,
      truncated: table.rows.length > PREVIEW_LIMIT,
      totals:    table.totals,
    });
  } catch (e) {
    console.error(`[reports/${type}]`, e);
    return NextResponse.json({ error: "Ошибка формирования отчёта" }, { status: 500 });
  }
}
