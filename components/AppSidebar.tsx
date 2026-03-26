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
import { User } from "lucide-react"
import { usePathname } from "next/navigation"
import { format } from "date-fns"
import Link from "next/link"

export function AppSidebar() {
  const pathname = usePathname()
  const today = format(new Date(), "dd MMM yyyy")

  const links = [
    { name: "Dashboard",  href: "/dashboard" },
    { name: "Клиенты",    href: "/clients" },
    { name: "Задачи",     href: "/tasks" },
    { name: "Документы",  href: "/documents" },
    { name: "Отчётность", href: "/reports" },
    { name: "Настройки",  href: "/users" },
  ]

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

      <SidebarFooter className="flex flex-row items-center justify-between mt-auto border-t border-zinc-800 p-4 text-xs text-zinc-400">
        <span>Сегодня: {today}</span>
        <Link href="/dashboard/profile">
          <User className="w-4 h-4 text-zinc-400 hover:text-white transition-colors" />
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}