import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { controlChecks } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, ({ lang }) => controlChecks(lang));
