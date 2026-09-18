import { pool } from "./postgres";

let ensured = false;

/** Colonnes workflow confirmation entreprise / réception cabinet (idempotent). */
export async function ensureInvoiceWorkflowColumns(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "userConfirmedAt" TIMESTAMPTZ;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "userConfirmedByUserId" TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "accountantReceivedAt" TIMESTAMPTZ;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "accountantReceivedByEmail" VARCHAR(255);
  `);
  ensured = true;
}
