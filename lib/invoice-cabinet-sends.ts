import { pool } from "./postgres";
import { normalizeRegionKey } from "./country-regions";

let tableReady: Promise<void> | null = null;

export async function ensureInvoiceCabinetSendsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS invoice_cabinet_sends (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "invoiceId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          region VARCHAR(64) NOT NULL,
          "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("invoiceId", "userId", region)
        );
        CREATE INDEX IF NOT EXISTS invoice_cabinet_sends_invoice_idx
          ON invoice_cabinet_sends ("invoiceId");
        CREATE INDEX IF NOT EXISTS invoice_cabinet_sends_user_idx
          ON invoice_cabinet_sends ("userId");
      `)
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  await tableReady;
}

/** Enregistre un envoi réussi vers le cabinet d’un pays (Togo, France, etc.). */
export async function persistInvoiceCabinetSends(
  userId: string,
  invoiceIds: string[],
  region: string,
  sentAt: Date = new Date(),
): Promise<void> {
  const regionKey = normalizeRegionKey(region);
  if (!regionKey || invoiceIds.length === 0) return;
  await ensureInvoiceCabinetSendsTable();
  for (const invoiceId of invoiceIds) {
    await pool.query(
      `INSERT INTO invoice_cabinet_sends ("invoiceId", "userId", region, "sentAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("invoiceId", "userId", region) DO UPDATE SET "sentAt" = EXCLUDED."sentAt"`,
      [invoiceId, userId, regionKey, sentAt],
    );
  }
}

export type CabinetSentMap = Map<string, Record<string, string>>;

/** invoiceId → { regionKey → sentAt ISO } */
export async function loadInvoiceCabinetSendsMap(
  userId: string,
  invoiceIds: string[],
): Promise<CabinetSentMap> {
  const map: CabinetSentMap = new Map();
  if (invoiceIds.length === 0) return map;
  try {
    await ensureInvoiceCabinetSendsTable();
    const result = await pool.query(
      `SELECT "invoiceId", region, "sentAt"
       FROM invoice_cabinet_sends
       WHERE "userId" = $1 AND "invoiceId" = ANY($2::text[])`,
      [userId, invoiceIds],
    );
    for (const row of result.rows as { invoiceId: string; region: string; sentAt: Date | string }[]) {
      const byRegion = map.get(row.invoiceId) ?? {};
      byRegion[normalizeRegionKey(row.region)] = new Date(row.sentAt).toISOString();
      map.set(row.invoiceId, byRegion);
    }
  } catch (err) {
    console.warn("invoice_cabinet_sends unavailable:", (err as Error).message);
  }
  return map;
}
