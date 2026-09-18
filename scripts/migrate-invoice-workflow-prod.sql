-- Migration PRODUCTION — ajoute uniquement les colonnes workflow (sans DROP).
-- Exécuter sur le schéma compta (Neon) : psql "$DATABASE_URL" -f scripts/migrate-invoice-workflow-prod.sql
-- Ou coller dans la console SQL Neon.

SET search_path TO compta, public;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "userConfirmedAt" TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "userConfirmedByUserId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "accountantReceivedAt" TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "accountantReceivedByEmail" VARCHAR(255);

-- Vérification (optionnel)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'compta'
  AND table_name = 'invoices'
  AND column_name IN (
    'userConfirmedAt',
    'userConfirmedByUserId',
    'accountantReceivedAt',
    'accountantReceivedByEmail'
  )
ORDER BY column_name;
