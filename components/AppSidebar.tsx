"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
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
  const isAdmin = user?.role === "admin"

  const groups = [
    {
      label: t("nav.groupCRM"),
      links: [
        { name: t("nav.customers"), href: "/customers" },
        { name: t("nav.leads"),     href: "/leads" },
        { name: t("nav.sales"),     href: "/sales" },
        { name: t("nav.segments"),  href: "/segments" },
        { name: t("nav.churn"),     href: "/churn" },
      ],
    },
    {
      label: t("nav.groupComms"),
      links: [
        { name: t("nav.inbox"),       href: "/inbox" },
        { name: t("nav.email"),       href: "/email" },
        { name: t("nav.broadcasts"),  href: "/broadcasts" },
        { name: t("nav.automations"), href: "/automations" },
      ],
    },
    {
      label: t("nav.groupOps"),
      links: [
        { name: t("nav.tasks"),         href: "/tasks" },
        { name: t("nav.items"),         href: "/items" },
        { name: t("nav.weightTickets"), href: "/weight-tickets" },
      ],
    },
    ...(isAdmin ? [{
      label: t("nav.groupAdmin"),
      links: [
        { name: t("nav.managers"),  href: "/managers" },
        { name: t("nav.auditLog"),  href: "/audit-log" },
        { name: t("nav.users"),     href: "/users" },
      ],
    }] : []),
  ]

  return (
    <Sidebar className="bg-zinc-900 text-white border-r border-zinc-800">
      <SidebarHeader className="p-4 border-b border-zinc-800">
        <Link href="/dashboard" className="text-xl font-semibold tracking-wide hover:text-zinc-300 transition-colors">
          CRM Oracle
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={`w-full justify-start rounded-lg px-3 py-2 text-sm transition ${
                    pathname === "/dashboard"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Link href="/dashboard">{t("nav.dashboard")}</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-zinc-500 px-3 pt-3 pb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.links.map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      asChild
                      className={`w-full justify-start rounded-lg px-3 py-2 text-sm transition ${
                        pathname === link.href
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <Link href={link.href}>{link.name}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-zinc-800 p-4 text-sm text-zinc-400 space-y-2">
        <div className="flex items-center justify-between">
          <span>{user ? `${user.username}` : "—"}</span>
          {user && (
            <button
              onClick={logout}
              className="border border-gray-800 rounded-4xl px-2 py-1 text-zinc-400 hover:text-white transition-colors"
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
