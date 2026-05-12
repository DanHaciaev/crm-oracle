"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import CustomerDetail from "@/components/CustomerDetail";
import { useAuth } from "@/hooks/useAuth";

export default function CustomerDetailPage() {
  const { id }            = useParams<{ id: string }>();
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
      <CustomerDetail id={id} />
    </Layout>
  );
}
