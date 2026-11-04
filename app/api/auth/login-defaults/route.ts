import { NextResponse } from "next/server";

// Values to prefill on the login page (DEFAULT_USERNAME / DEFAULT_PASSWORD
// from .env). Deliberately public — the owner wants the form prefilled for
// testers. Kept out of the source so the password never lands in git;
// leave them empty in .env to show an empty form.
export function GET() {
  return NextResponse.json({
    username: process.env.DEFAULT_USERNAME ?? "",
    password: process.env.DEFAULT_PASSWORD ?? "",
  });
}
