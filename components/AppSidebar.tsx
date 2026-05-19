"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { format } from "date-fns"
import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"
import { useT } from "@/lib/locale"

export function AppSidebar() {
  const pathname    = usePathname()
  const today       = format(new Date(), "dd MMM yyyy")
  const { user, logout } = useAuth()
  const t = useT()

  const links = [
    { name: t("nav.dashboard"),     href: "/dashboard",       adminOnly: false },
    { name: t("nav.inbox"),         href: "/inbox",           adminOnly: false },
    { name: t("nav.customers"),     href: "/customers",       adminOnly: false },
    { name: t("nav.segments"),      href: "/segments",        adminOnly: false },
    { name: t("nav.sales"),         href: "/sales",           adminOnly: false },
    { name: t("nav.tasks"),         href: "/tasks",           adminOnly: false },
    { name: t("nav.leads"),         href: "/leads",           adminOnly: false },
    { name: t("nav.churn"),         href: "/churn",           adminOnly: false },
    { name: t("nav.broadcasts"),    href: "/broadcasts",      adminOnly: false },
    { name: t("nav.automations"),   href: "/automations",     adminOnly: false },
    { name: t("nav.items"),         href: "/items",           adminOnly: false },
    { name: t("nav.weightTickets"), href: "/weight-tickets",  adminOnly: false },
    { name: t("nav.managers"),      href: "/managers",        adminOnly: true  },
    { name: t("nav.auditLog"),      href: "/audit-log",       adminOnly: true  },
    { name: t("nav.users"),         href: "/users",           adminOnly: true  },
  ].filter((l) => !l.adminOnly || user?.role === "admin")

  return (
    <Sidebar className="bg-zinc-900 text-white border-r border-zinc-800">
      <SidebarHeader className="p-4 text-xl font-semibold tracking-wide border-b border-zinc-800">
        CRM Oracle
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarMenu>
          {links.map((link) => {
            const isActive = pathname === link.href
            return (
              <SidebarMenuItem key={link.name}>
                <SidebarMenuButton
                  asChild
                  className={`w-full justify-start rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Link href={link.href}>{link.name}</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-zinc-800 p-4 text-xs text-zinc-400 space-y-2">
        <div className="flex items-center justify-between">
          <span>{user ? `${user.username}` : "—"}</span>
          {user && (
            <button
              onClick={logout}
              className="border border-zinc-400 rounded-4xl px-2 py-1 text-zinc-400 hover:text-white transition-colors"
            >
              {t("common.logout")}
            </button>
          )}
        </div>
        <div>{t("common.today")}: {today}</div>
      </SidebarFooter>
    </Sidebar>
  )
}
