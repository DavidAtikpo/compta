/**
 * Remet les statuts « envoyé cabinet » (sent / sentAt) à un état neutre.
 * Usage : npx tsx scripts/normalize-invoice-send-status.ts
 */
import { pool } from "../lib/postgres";

async function main() {
  const sent = await pool.query(
    `UPDATE invoices
     SET status = 'pending', "sentAt" = NULL, "updatedAt" = NOW()
     WHERE status = 'sent' AND ("deletedAt" IS NULL)
     RETURNING id`,
  );
  const cleared = await pool.query(
    `UPDATE invoices
     SET "sentAt" = NULL, "updatedAt" = NOW()
     WHERE "sentAt" IS NOT NULL AND status <> 'sent' AND ("deletedAt" IS NULL)
     RETURNING id`,
  );
  console.log(
    `OK — ${sent.rowCount ?? 0} facture(s) passées de « sent » à « pending », ${cleared.rowCount ?? 0} sentAt effacé(s).`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
