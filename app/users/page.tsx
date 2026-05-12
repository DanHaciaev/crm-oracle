"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import UsersTable from "@/components/UsersTable";
import { useAuth } from "@/hooks/useAuth";

export default function UsersPage() {
  const { user, loading } = useAuth();
  const router            = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user)               router.replace("/");
    else if (user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "admin") {
    return (
      <Layout>
        <div className="p-8 text-sm text-gray-400">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-1">Пользователи</h1>
        <p className="text-sm text-gray-500 mb-6">Управление учётными записями</p>
        <UsersTable currentUserId={user.id} />
      </div>
    </Layout>
  );
}
