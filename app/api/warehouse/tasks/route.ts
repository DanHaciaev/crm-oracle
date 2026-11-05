import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { processingTasks } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, ({ lang, sp }) => processingTasks(sp, lang));
