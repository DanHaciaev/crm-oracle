"use client";

import { useEffect } from "react";

// Applies ?<key>=… from the address bar once on mount — lets global search
// link to a list page with its own search box already filled in. Read in an
// effect (not during render) so server and client markup stay identical.
export function useUrlParam(key: string, apply: (value: string) => void) {
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(key);
    if (v) apply(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
