-- Plusieurs cabinets par pays : exécuter une fois si la table a encore UNIQUE(region) seul.
-- Ensuite : npx prisma db push (recommandé) ou appliquer manuellement ci-dessous.

ALTER TABLE accountants ADD COLUMN IF NOT EXISTS label VARCHAR(255);

ALTER TABLE accountants DROP CONSTRAINT IF EXISTS accountants_region_key;
ALTER TABLE accountants DROP CONSTRAINT IF EXISTS "accountants_region_key";

-- Index unique (region, email) — évite les doublons exacts
DROP INDEX IF EXISTS accountants_region_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS accountants_region_email_key ON accountants (region, email);
