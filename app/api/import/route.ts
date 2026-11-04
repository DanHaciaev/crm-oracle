import { NextRequest } from "next/server";
import { ImportError, importLog, isEntity, parseFile, parseMapping, run, suggestMapping, FIELDS } from "@/lib/import";
import { requireEntity, withImportUser } from "@/lib/import-api";

// GET — recent imports the user may see.
export async function GET() {
  return withImportUser(async u => ({ entities: u.entities, log: await importLog(u.entities) }));
}

// POST multipart: file, entity, action = parse | check | commit, mapping (JSON, for check/commit).
// parse → headers, sample rows, suggested mapping; check → dry run; commit → load.
export async function POST(req: NextRequest) {
  return withImportUser(async u => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file"), entity = form?.get("entity"), action = form?.get("action");
    if (!(file instanceof File)) throw new ImportError("Файл обязателен");
    if (!isEntity(entity)) throw new ImportError("Неверный тип данных");
    requireEntity(u.entities, entity);
    const sheet = await parseFile(Buffer.from(await file.arrayBuffer()), file.name);
    if (action === "parse") {
      return { headers: sheet.headers, sample: sheet.rows.slice(0, 5), total: sheet.rows.length,
        mapping: suggestMapping(entity, sheet.headers), fields: FIELDS[entity].map(f => ({ key: f.key, required: !!f.required })) };
    }
    if (action !== "check" && action !== "commit") throw new ImportError("Неверное действие");
    const mapping = parseMapping(entity, form?.get("mapping"), sheet.headers.length);
    return run(entity, sheet, mapping, u.username, file.name, action === "check");
  });
}
