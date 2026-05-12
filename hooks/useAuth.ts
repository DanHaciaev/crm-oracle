"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface AuthUser {
  id:         number;
  username:   string;
  first_name: string | null;
  last_name:  string | null;
  role:       "admin" | "manager";
  created_at: string;
}

export function useAuth() {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setUser(null);
        else            setUser(data as AuthUser);
        setLoading(false);
      })
      .catch(() => { setUser(null); setLoading(false); });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  }

  return { user, loading, logout };
}
