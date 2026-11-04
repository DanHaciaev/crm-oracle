import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { DOC_BUILDERS, DocNotFound, parseLang } from "@/lib/documents";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { type } = await params;
  const builder = DOC_BUILDERS[type];
  if (!builder) return NextResponse.json({ error: "Неизвестный тип документа" }, { status: 404 });

  const sp   = req.nextUrl.searchParams;
  const lang = parseLang(sp.get("lang"));

  try {
    if (builder.kind === "record") {
      const id = Number(sp.get("id"));
      if (!id) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });
      return NextResponse.json(await builder.build(id, lang));
    }
    return NextResponse.json(await builder.build(sp, lang));
  } catch (e) {
    if (e instanceof DocNotFound) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(`[documents/${type}]`, e);
    return NextResponse.json({ error: "Ошибка формирования документа" }, { status: 500 });
  }
}
