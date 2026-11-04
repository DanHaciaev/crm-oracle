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
  UserCog, History, UserCircle, LogOut, Truck, GitMerge, Search, MessagesSquare,
  Warehouse, ShoppingCart, FileText, FileSpreadsheet, Gift, CalendarDays, Undo2,
  ChevronDown, ChevronRight, Boxes, Building2, BadgePercent, Banknote, BookOpen,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { format } from "date-fns"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useT } from "@/lib/locale"
import { can, pageModule } from "@/lib/permissions"

const OPEN_GROUPS_KEY = "sidebarOpenGroups"

export function AppSidebar() {
  const pathname    = usePathname()
  const today       = format(new Date(), "dd MMM yyyy")
  const { user, logout } = useAuth()
  const t = useT()

  // Grouped by business process; `key` (not the translated label) identifies
  // a group so the saved open/closed state survives a language switch.
  const allGroups = [
    {
      key: "sales",
      label: t("nav.groupSales"),
      links: [
        { name: t("nav.customers"),    href: "/customers",     icon: Users },
        { name: t("nav.leads"),        href: "/leads",         icon: Target },
        { name: t("nav.sales"),        href: "/sales",         icon: TrendingUp },
        { name: t("nav.returns"),      href: "/returns",       icon: Undo2 },
        { name: t("nav.clientViewer"), href: "/client-viewer", icon: Search },
        { name: t("nav.loyalty"),      href: "/loyalty",       icon: Gift },
      ],
    },
    {
      key: "supply",
      label: t("nav.groupSupply"),
      links: [
        { name: t("nav.warehouse"),     href: "/warehouse",      icon: Boxes },
        { name: t("nav.suppliers"),     href: "/suppliers",      icon: Truck },
        { name: t("nav.purchases"),     href: "/purchases",      icon: ShoppingCart },
        { name: t("nav.weightTickets"), href: "/weight-tickets", icon: Scale },
        { name: t("nav.custody"),       href: "/custody",        icon: Warehouse },
        { name: t("nav.items"),         href: "/items",          icon: Package },
        { name: t("nav.directories"),   href: "/directories",    icon: BookOpen },
      ],
    },
    {
      key: "docs",
      label: t("nav.groupDocs"),
      links: [
        { name: t("nav.documents"), href: "/documents", icon: FileText },
        { name: t("nav.reports"),   href: "/reports",   icon: FileSpreadsheet },
        { name: t("nav.rates"),     href: "/rates",     icon: Banknote },
        { name: t("nav.profitability"), href: "/profitability", icon: BadgePercent },
      ],
    },
    {
      key: "analytics",
      label: t("nav.groupAnalytics"),
      links: [
        { name: t("nav.segments"),   href: "/segments",   icon: PieChart },
        { name: t("nav.churn"),      href: "/churn",      icon: AlertTriangle },
        { name: t("nav.duplicates"), href: "/duplicates", icon: GitMerge },
      ],
    },
    {
      key: "comms",
      label: t("nav.groupComms"),
      links: [
        { name: t("nav.staffChat"),  href: "/staff-chat", icon: MessagesSquare },
        { name: t("nav.inbox"),      href: "/inbox",      icon: MessageSquare },
        { name: t("nav.email"),      href: "/email",      icon: Mail },
        { name: t("nav.broadcasts"), href: "/broadcasts", icon: Megaphone },
      ],
    },
    {
      key: "work",
      label: t("nav.groupWork"),
      links: [
        { name: t("nav.tasks"),    href: "/tasks",    icon: CheckSquare },
        { name: t("nav.calendar"), href: "/calendar", icon: CalendarDays },
      ],
    },
    {
      key: "admin",
      label: t("nav.groupAdmin"),
      links: [
        { name: t("nav.managers"), href: "/managers",  icon: UserCog },
        { name: t("nav.users"),    href: "/users",     icon: UserCircle },
        { name: t("nav.auditLog"), href: "/audit-log", icon: History },
        { name: t("nav.settings"), href: "/settings",  icon: Building2 },
      ],
    },
  ]

  // Only sections the user's role can at least view; empty groups disappear.
  const groups = allGroups
    .map(g => ({ ...g, links: g.links.filter(l => { const m = pageModule(l.href); return !m || can(user?.permissions, m, "view") }) }))
    .filter(g => g.links.length > 0)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const activeGroup = groups.find(g => g.links.some(l => isActive(l.href)))?.key

  // Collapsible sections (several may be open at once): only the first one is
  // open on first launch. Every page renders its own <Layout>, so the sidebar
  // remounts on each navigation — the open set is kept in sessionStorage or
  // every click would reset it. Starts empty and is filled in an effect
  // (client-only) to avoid a server/client hydration mismatch.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set<string>())
  useEffect(() => {
    let saved: string[] | null = null
    try { saved = JSON.parse(sessionStorage.getItem(OPEN_GROUPS_KEY) ?? "null") } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenGroups(new Set(Array.isArray(saved) ? saved : ["sales"]))
  }, [])

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??"

  const linkCls = (active: boolean) =>
    `w-full justify-start rounded-lg px-3 py-2 text-sm transition gap-2.5 ${
      active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
    }`

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
                <SidebarMenuButton asChild className={linkCls(pathname === "/dashboard")}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    {t("nav.dashboard")}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => {
          // The group holding the current page always stays open, so the
          // active item is never hidden inside a collapsed section.
          const isOpen = openGroups.has(group.key) || group.key === activeGroup
          return (
            <SidebarGroup key={group.key} className="py-0.5">
              <SidebarGroupLabel asChild className="px-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500 px-3 pt-3 pb-1 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  <span>{group.label}</span>
                  {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                </button>
              </SidebarGroupLabel>
              {isOpen && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.links.map((link) => {
                      const Icon = link.icon
                      return (
                        <SidebarMenuItem key={link.href}>
                          <SidebarMenuButton asChild className={linkCls(isActive(link.href))}>
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
              )}
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2.5">
          <Link href="/account" title={t("account.title")} className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg hover:bg-zinc-800 -m-1 p-1 transition">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 font-medium truncate">{user?.username ?? "—"}</div>
              <div className="text-xs text-zinc-500">{today}</div>
            </div>
          </Link>
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
