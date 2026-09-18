/** URL directe (sans pooler) pour migrations Prisma / DDL / pg Pool. */
export function neonDirectDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return raw;
  return raw.replace(/(ep-[^.]+)-pooler(\.[^/?]+)/, "$1$2");
}

/** Paramètres recommandés Prisma + Neon. */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    // Prisma + PgBouncer (Neon pooler) : désactive les prepared statements.
    if (url.hostname.includes("-pooler.") && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    } else if (!url.hostname.includes("-pooler.")) {
      url.searchParams.delete("pgbouncer");
    }
    // Neon peut mettre >5 s à se réveiller si la branche était en veille.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "30");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * URL utilisée par Prisma dans l'app.
 * En dev local : endpoint direct Neon (plus fiable que le pooler, comme pg Pool).
 * Override possible via PRISMA_DATABASE_URL.
 */
export function prismaConnectionUrl(raw: string | undefined = process.env.DATABASE_URL): string | undefined {
  const override = process.env.PRISMA_DATABASE_URL?.trim();
  if (override) return normalizeDatabaseUrl(override);

  const base =
    process.env.NODE_ENV !== "production"
      ? neonDirectDatabaseUrl(raw) ?? raw
      : raw;
  return normalizeDatabaseUrl(base);
}
