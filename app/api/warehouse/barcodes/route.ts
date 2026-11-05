import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { barcodes } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, ({ lang, sp }) => barcodes(sp, lang));
