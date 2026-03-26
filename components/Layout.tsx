"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router            = useRouter();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Загрузка...</div>;
  if (!user)   { router.push("/"); return null; }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex items-center px-5 py-4 border-b">
          <SidebarTrigger />
        </div>
        {children}
      </main>
    </SidebarProvider>
  );
}