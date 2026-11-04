import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { movements, parseMovementFilters } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, ({ lang, sp }) => movements(parseMovementFilters(sp), lang));
