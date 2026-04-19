"use client";

import { useLayoutEffect } from "react";

/** Ne pas rediriger sur 401 attendues (identifiants invalides à la connexion). */
const EXCLUDE_401_REDIRECT_PATHS = ["/api/auth/login", "/api/auth/signup"];

/**
 * Intercepte `fetch` : si une requête avec `Authorization: Bearer` reçoit 401,
 * le token est retiré et l’utilisateur est renvoyé vers /login (session expirée ou invalide).
 */
export function SessionExpiredRedirect() {
  useLayoutEffect(() => {
    const w = globalThis as typeof globalThis & { __comptaAuthFetchPatched?: boolean };
    if (w.__comptaAuthFetchPatched) return;
    w.__comptaAuthFetchPatched = true;

    const origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await origFetch(input, init);
      if (res.status !== 401) return res;

      const urlString =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      try {
        const path = new URL(urlString, globalThis.location?.origin ?? "http://localhost").pathname;
        if (EXCLUDE_401_REDIRECT_PATHS.some((p) => path.includes(p))) return res;
      } catch {
        /* ignore */
      }

      const headers =
        init?.headers != null
          ? new Headers(init.headers as HeadersInit)
          : input instanceof Request
            ? new Headers(input.headers)
            : new Headers();
      const auth = headers.get("authorization");
      if (auth?.startsWith("Bearer ")) {
        try {
          globalThis.localStorage?.removeItem("compta-token");
        } catch {
          /* ignore */
        }
        globalThis.location.assign("/login");
      }
      return res;
    };
  }, []);

  return null;
}
