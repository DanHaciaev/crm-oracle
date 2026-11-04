import { NextRequest } from "next/server";
import { ImportError, isEntity, template, type ImportLang } from "@/lib/import";
import { requireEntity, withImportUser } from "@/lib/import-api";

// GET ?entity=customers|leads|payments&lang=ru|ro|en — empty .xlsx with the expected columns.
export async function GET(req: NextRequest) {
  return withImportUser(async u => {
    const entity = req.nextUrl.searchParams.get("entity");
    if (!isEntity(entity)) throw new ImportError("Неверный тип данных");
    requireEntity(u.entities, entity);
    const l = req.nextUrl.searchParams.get("lang");
    const lang: ImportLang = l === "ro" || l === "en" ? l : "ru";
    const buf = await template(entity, lang);
    return new Response(new Uint8Array(buf), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="import_${entity}.xlsx"`,
    } });
  });
}
