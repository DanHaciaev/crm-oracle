"use client";

import Layout from "@/components/Layout";
import { UsersTable } from "@/components/UsersTable";

export default function UsersPage() {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-1">Пользователи</h1>
        <UsersTable />
      </div>
    </Layout>
  );
}