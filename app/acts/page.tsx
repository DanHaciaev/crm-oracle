"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ActsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/weight-tickets"); }, [router]);
  return null;
}
