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

export function AppSidebar() {
  const pathname    = usePathname()
  const today       = format(new Date(), "dd MMM yyyy")
  const { user, logout } = useAuth()

  const links = [
    { name: "Dashboard",         href: "/dashboard",       adminOnly: false },
    { name: "Inbox",             href: "/inbox",           adminOnly: false },
    { name: "Клиенты",           href: "/customers",       adminOnly: false },
    { name: "Сегментация",       href: "/segments",        adminOnly: false },
    { name: "Продажи",           href: "/sales",           adminOnly: false },
    { name: "Pipeline",          href: "/pipeline",        adminOnly: false },
    { name: "Задачи",            href: "/tasks",           adminOnly: false },
    { name: "Риск оттока",       href: "/churn",           adminOnly: false },
    { name: "Рассылки",          href: "/broadcasts",      adminOnly: false },
    { name: "Товары",            href: "/items",           adminOnly: false },
    { name: "Акты взвешивания",  href: "/weight-tickets",  adminOnly: false },
    { name: "Пользователи",      href: "/users",           adminOnly: true },
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
              Выйти
            </button>
          )}
        </div>
        <div>Сегодня: {today}</div>
      </SidebarFooter>
    </Sidebar>
  )
}
