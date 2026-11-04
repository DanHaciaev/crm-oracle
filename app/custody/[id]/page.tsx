"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Layout from "@/components/Layout";
import CustodyClientDetail from "@/components/CustodyClientDetail";
import { useAuth } from "@/hooks/useAuth";

export default function Page() {
  const { user, loading } = useAuth();
  const router            = useRouter();
  const params            = useParams();
  const id                = params.id as string;

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
      <CustodyClientDetail id={id} />
    </Layout>
  );
}
