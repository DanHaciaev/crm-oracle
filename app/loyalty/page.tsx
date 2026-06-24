"use client";

import Layout from "@/components/Layout";
import LoyaltyPage from "@/components/LoyaltyPage";

export default function LoyaltyRoute() {
  return (
    <Layout>
      <div className="flex-1 overflow-auto">
        <LoyaltyPage />
      </div>
    </Layout>
  );
}
