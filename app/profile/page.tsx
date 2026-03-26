"use client";

import Layout from "@/components/Layout";
import UserProfile from "@/components/UserProfile";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { logout } = useAuth();

  return (
    <Layout>
      <div className="flex items-center justify-end px-8 pt-6">
        <button
          onClick={logout}
          className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition text-gray-600"
        >
          Выйти
        </button>
      </div>
      <UserProfile />
    </Layout>
  );
}