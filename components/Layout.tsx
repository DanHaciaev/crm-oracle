"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import NotificationBell from "@/components/NotificationBell";
import LangSwitcher from "@/components/LangSwitcher";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/lib/confirm";
import AccessGuard from "@/components/AccessGuard";
import GlobalSearch from "@/components/GlobalSearch";

export default function Layout({ children, fullHeight }: { children: React.ReactNode; fullHeight?: boolean }) {
  return (
    <ConfirmProvider>
    <SidebarProvider className="min-h-0 h-svh overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#c8d3e8] bg-white shrink-0">
          <SidebarTrigger />
          <div className="flex-1 flex justify-center px-3 min-w-0">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-3">
            <LangSwitcher />
            <NotificationBell />
          </div>
        </div>
        <div className={`flex-1 ${fullHeight ? "overflow-hidden flex flex-col" : "overflow-auto"}`}>
          <AccessGuard>{children}</AccessGuard>
        </div>
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1F2A44",
            color: "#E6ECF5",
            border: "1px solid #374867",
            borderRadius: "10px",
            fontSize: "14px",
          },
        }}
      />
    </SidebarProvider>
    </ConfirmProvider>
  );
}
