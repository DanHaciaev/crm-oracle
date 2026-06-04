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

const CACHE_KEY = "crm_auth_user";

function readCache(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCache(u: AuthUser | null) {
  try {
    if (u) sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
    else    sessionStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
}

export function useAuth() {
  // Must start null/true on both server and client to avoid hydration mismatch.
  // Cache is applied in useEffect (client-only), after hydration.
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router                = useRouter();

  useEffect(() => {
    // Read cache immediately — eliminates flicker on navigation
    const cached = readCache();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    // Always revalidate in background (catches logout / expired session)
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if ((data as { error?: string }).error) {
          setUser(null);
          writeCache(null);
        } else {
          const u = data as AuthUser;
          setUser(u);
          writeCache(u);
        }
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    writeCache(null);
    setUser(null);
    router.push("/");
  }

  return { user, loading, logout };
}
