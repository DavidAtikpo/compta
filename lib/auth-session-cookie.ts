/** Cookie miroir du JWT (même origine) pour les GET API depuis la barre d’adresse. */
export const COMPTA_TOKEN_COOKIE = "compta-token";

const MAX_AGE_SEC = 7 * 24 * 3600;

export function syncComptaTokenCookie(token: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  if (!token) {
    document.cookie = `${COMPTA_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${COMPTA_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax${secure}`;
}
