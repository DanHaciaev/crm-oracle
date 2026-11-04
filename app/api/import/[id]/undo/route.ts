import { ImportError, undoImport } from "@/lib/import";
import { requireEntity, withImportUser } from "@/lib/import-api";

// POST — cancel every payment a payments import created.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withImportUser(async u => {
    requireEntity(u.entities, "payments");
    const n = Number(id);
    if (!(n > 0)) throw new ImportError("Неверный импорт");
    return undoImport(n, u.username);
  });
}
