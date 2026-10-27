import { pool } from "./postgres";

let ensured = false;

/** Dossiers utilisateur pour classer les factures / pièces jointes (idempotent). */
export async function ensureInvoiceFoldersSchema(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS invoice_folders_user_id_idx ON invoice_folders ("userId");
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "folderId" UUID;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoices_folder_id_fkey'
      ) THEN
        ALTER TABLE invoices
          ADD CONSTRAINT invoices_folder_id_fkey
          FOREIGN KEY ("folderId") REFERENCES invoice_folders (id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  ensured = true;
}
