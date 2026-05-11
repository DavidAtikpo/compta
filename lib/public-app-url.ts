/**
 * Origine publique de l’application (sans slash final).
 * Pour des liens cliquables (email, SMS), définir dans `.env` :
 * `NEXT_PUBLIC_APP_URL=https://votre-domaine.com` (ou `NEXT_PUBLIC_BASE_URL`).
 */
export function getPublicAppOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return "";
}

/** URL absolue ; si aucune origine n’est configurée, retourne seulement le chemin (non cliquable hors navigateur). */
export function absoluteAppUrl(path: string): string {
  const origin = getPublicAppOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!origin) return p;
  return `${origin}${p}`;
}
