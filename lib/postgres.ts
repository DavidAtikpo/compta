import { Pool } from "pg";

/**
 * Neon's connection pooler (PgBouncer) does NOT support the `search_path`
 * startup parameter. We must use the unpooled endpoint for raw pg queries
 * that need the `compta` schema in the search_path.
 *
 * Unpooled URL = pooled URL with "-pooler" removed from the hostname.
 */
function prismaSchemaFromUrl(url: string | undefined): string | undefined {
  const fromEnv = process.env.DATABASE_SCHEMA?.trim();
  if (fromEnv) return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fromEnv) ? fromEnv : undefined;
  if (!url) return undefined;
  const match = url.match(/[?&]schema=([^&]+)/);
  const raw = match ? decodeURIComponent(match[1]) : undefined;
  return raw && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? raw : undefined;
}

function unpooledUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // Replace "-pooler" in the hostname: ep-xxx-pooler.region → ep-xxx.region
  return url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
}

const pooledUrl = process.env.DATABASE_URL;
const connectionString = unpooledUrl(pooledUrl) ?? pooledUrl;
const prismaSchema = prismaSchemaFromUrl(pooledUrl);

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  ...(prismaSchema
    ? { options: `-c search_path=${prismaSchema},public` }
    : {}),
});

export { pool };
