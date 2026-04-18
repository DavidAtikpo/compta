/**
 * Jeton OAuth2 client_credentials pour les API PISTE (ex. Légifrance lf-engine-app).
 * Variables : PISTE_OAUTH_CLIENT_ID, PISTE_OAUTH_CLIENT_SECRET
 * Sandbox : PISTE_SANDBOX=1 → sandbox-api + sandbox-oauth (AIFE).
 * @see https://github.com/SocialGouv/dila-api-client
 */

let cached: { token: string; expiresAt: number } | null = null;

function tokenUrl(): string {
  if (process.env.PISTE_SANDBOX === "1" || process.env.PISTE_SANDBOX === "true") {
    return (
      process.env.PISTE_OAUTH_TOKEN_URL ||
      "https://sandbox-oauth.aife.economie.gouv.fr/api/oauth/token"
    );
  }
  return process.env.PISTE_OAUTH_TOKEN_URL || "https://oauth.piste.gouv.fr/api/oauth/token";
}

export function pisteLegifranceApiBase(): string {
  if (process.env.PISTE_SANDBOX === "1" || process.env.PISTE_SANDBOX === "true") {
    return (
      process.env.PISTE_LEGIFRANCE_API_URL ||
      "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app"
    );
  }
  return (
    process.env.PISTE_LEGIFRANCE_API_URL ||
    "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app"
  );
}

export async function getPisteOAuthAccessToken(): Promise<string | null> {
  const clientId =
    process.env.PISTE_OAUTH_CLIENT_ID ||
    process.env.OAUTH_CLIENT_ID ||
    "";
  const clientSecret =
    process.env.PISTE_OAUTH_CLIENT_SECRET ||
    process.env.OAUTH_CLIENT_SECRET ||
    "";
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cached && cached.expiresAt > now + 5000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "openid",
  });

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error("PISTE OAuth:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  const ttlMs = Math.min(((data.expires_in ?? 3600) - 60) * 1000, 55 * 60 * 1000);
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return cached.token;
}
