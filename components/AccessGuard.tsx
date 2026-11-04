"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/locale";
import { can, pageModule } from "@/lib/permissions";

// Page-level check for a section the user's role can't see (opened by a
// direct link or a stale bookmark). Data is protected by proxy.ts anyway —
// this just replaces a page full of 403 errors with a clear message.
export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();
  const section = pageModule(pathname);

  // Until the fresh /api/auth/me arrives (a cached user may have no
  // permissions yet) the page renders normally.
  if (!section || !user?.permissions || can(user.permissions, section, "view")) return <>{children}</>;

  return (
    <div className="p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[50vh]">
      <ShieldOff className="w-10 h-10 text-gray-300" />
      <h1 className="text-lg font-semibold">{t("access.deniedTitle")}</h1>
      <p className="text-sm text-gray-500 max-w-md">{t("access.deniedText")}</p>
      <Link href="/dashboard" className="text-sm text-brand hover:underline">{t("access.toDashboard")}</Link>
    </div>
  );
}
