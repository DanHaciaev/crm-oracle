import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { userAccess } from "@/lib/permissions-server";
import { can } from "@/lib/permissions";
import { ENTITIES, ENTITY_MODULE, ImportError, type Entity } from "@/lib/import";

// /api/import/*: proxy.ts lets in anyone with edit on customers, leads or
// payments; each entity additionally needs edit on its own section.
export async function withImportUser(fn: (u: { username: string; entities: Entity[] }) => Promise<unknown>) {
  const store = await cookies();
  const payload = verifyToken(store.get("token")?.value ?? "");
  const user = payload ? await userAccess(payload.id) : null;
  if (!user?.active) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const entities = ENTITIES.filter(e => can(user.perms, ENTITY_MODULE[e], "edit"));
  try {
    const out = await fn({ username: user.username, entities });
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (e) {
    if (e instanceof ImportError || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[import]", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export function requireEntity(entities: Entity[], e: Entity) {
  if (!entities.includes(e)) throw new ImportError("Нет прав на загрузку этих данных");
}
