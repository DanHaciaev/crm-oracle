"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import NotificationBell from "@/components/NotificationBell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <SidebarTrigger />
          <NotificationBell />
        </div>
        {children}
      </main>
    </SidebarProvider>
  );
}
