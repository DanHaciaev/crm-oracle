"use client";

import Layout from "@/components/Layout";
import { ClientsTable } from "@/components/ClientsTable";

export default function ClientsPage() {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-1">Клиенты</h1>
        <ClientsTable />
      </div>
    </Layout>
  );
}