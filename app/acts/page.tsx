"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import WeightTicketsTable from "@/components/WeightTicketsTable";
import { useAuth } from "@/hooks/useAuth";

export default function ActsPage() {
  const { user, loading } = useAuth();
  const router            = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <Layout>
        <div className="p-8 text-sm text-gray-400">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <WeightTicketsTable />
    </Layout>
  );
}
