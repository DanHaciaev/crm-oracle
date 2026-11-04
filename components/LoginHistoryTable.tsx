"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";

export interface LoginRow {
  id: number; user_id: number | null; username: string; success: boolean; reason: string | null;
  ip: string | null; user_agent: string | null; created_at: string;
}

// Rough device label from the user agent — enough to spot an unknown device.
function device(ua: string | null) {
  if (!ua) return "—";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
           : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
           : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

// Shared by My account (own sign-ins) and Users > Sign-in history (all).
export function LoginHistoryTable({ rows, showUser }: { rows: LoginRow[]; showUser: boolean }) {
  const t = useT();
  return (
    <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
      <Table>
        <TableHeader className="sticky top-0 bg-white">
          <TableRow>
            <TableHead>{t("account.colTime")}</TableHead>
            {showUser && <TableHead>{t("account.colUser")}</TableHead>}
            <TableHead>{t("account.colResult")}</TableHead>
            <TableHead className="hidden sm:table-cell">IP</TableHead>
            <TableHead className="hidden md:table-cell">{t("account.colDevice")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={showUser ? 5 : 4} className="text-center text-gray-400 py-6">{t("account.noLogins")}</TableCell></TableRow>
          ) : rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {new Date(r.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </TableCell>
              {showUser && <TableCell className="text-sm">{r.username || "—"}</TableCell>}
              <TableCell className="text-sm">
                {r.success
                  ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />{t(r.reason === "2fa" ? "account.ok2fa" : "account.ok")}</span>
                  : <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" />{t(`account.reason_${r.reason ?? "bad_password"}`)}</span>}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm font-mono text-gray-600">{r.ip ?? "—"}</TableCell>
              <TableCell className="hidden md:table-cell text-sm text-gray-600" title={r.user_agent ?? ""}>{device(r.user_agent)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
