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
import {
  LayoutDashboard, Users, Target, TrendingUp, PieChart, AlertTriangle,
  MessageSquare, Mail, Megaphone, CheckSquare, Package, Scale,
  UserCog, History, UserCircle, LogOut, Truck, GitMerge,
} from "lucide-react"
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
        { name: t("nav.customers"), href: "/customers", icon: Users },
        { name: t("nav.suppliers"), href: "/suppliers", icon: Truck },
        { name: t("nav.leads"),     href: "/leads",     icon: Target },
        { name: t("nav.sales"),     href: "/sales",     icon: TrendingUp },
        { name: t("nav.segments"),    href: "/segments",    icon: PieChart },
        { name: t("nav.churn"),       href: "/churn",       icon: AlertTriangle },
        { name: t("nav.duplicates"),  href: "/duplicates",  icon: GitMerge },
      ],
    },
    {
      label: t("nav.groupComms"),
      links: [
        { name: t("nav.inbox"),       href: "/inbox",       icon: MessageSquare },
        { name: t("nav.email"),       href: "/email",       icon: Mail },
        { name: t("nav.broadcasts"),  href: "/broadcasts",  icon: Megaphone },
      ],
    },
    {
      label: t("nav.groupOps"),
      links: [
        { name: t("nav.tasks"),         href: "/tasks",          icon: CheckSquare },
        { name: t("nav.items"),         href: "/items",          icon: Package },
        { name: t("nav.weightTickets"), href: "/weight-tickets", icon: Scale },
      ],
    },
    ...(isAdmin ? [{
      label: t("nav.groupAdmin"),
      links: [
        { name: t("nav.managers"),  href: "/managers",  icon: UserCog },
        { name: t("nav.auditLog"),  href: "/audit-log", icon: History },
        { name: t("nav.users"),     href: "/users",     icon: UserCircle },
      ],
    }] : []),
  ]

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??"

  return (
    <Sidebar className="bg-zinc-900 text-white border-r border-zinc-800">
      <SidebarHeader className="p-4 border-b border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-semibold tracking-wide group-hover:text-zinc-300 transition-colors">
            CRM Oracle
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={`w-full justify-start rounded-lg px-3 py-2 text-sm transition gap-2.5 ${
                    pathname === "/dashboard"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    {t("nav.dashboard")}
                  </Link>
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
                {group.links.map((link) => {
                  const Icon = link.icon
                  const active = pathname === link.href
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        className={`w-full justify-start rounded-lg px-3 py-2 text-sm transition gap-2.5 ${
                          active
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        }`}
                      >
                        <Link href={link.href}>
                          <Icon className="w-4 h-4 shrink-0" />
                          {link.name}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200 font-medium truncate">{user?.username ?? "—"}</div>
            <div className="text-xs text-zinc-500">{today}</div>
          </div>
          {user && (
            <button
              onClick={logout}
              title={t("common.logout")}
              className="text-zinc-500 hover:text-white transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
