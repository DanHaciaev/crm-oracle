"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import NotificationBell from "@/components/NotificationBell";
import LangSwitcher from "@/components/LangSwitcher";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <SidebarTrigger />
          <div className="flex items-center gap-3">
            <LangSwitcher />
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </SidebarProvider>
  );
}
