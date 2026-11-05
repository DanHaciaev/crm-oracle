import { NextRequest, NextResponse } from "next/server";
import { parseLang } from "@/lib/documents/common";
import { withQuoteUser } from "@/lib/quotes-api";
import { quoteDetail } from "@/lib/quotes";
import { generateQuotePdf } from "@/lib/pdf-quote";

// The quote as a PDF file, in the language asked for (?lang=ro|ru|en).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  return withQuoteUser(async () => {
    const q = await quoteDetail(Number(id), lang);
    if (!q) return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    const pdf = await generateQuotePdf(q, lang);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${q.number}.pdf"`,
      },
    });
  });
}
