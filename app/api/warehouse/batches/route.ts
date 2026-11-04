import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { batches, parseBatchFilters } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, ({ lang, sp }) => batches(parseBatchFilters(sp), lang));
