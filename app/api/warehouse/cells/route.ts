import { NextRequest } from "next/server";
import { handle } from "@/lib/warehouse-api";
import { cells } from "@/lib/warehouse";

export const GET = (req: NextRequest) => handle(req, () => cells());
