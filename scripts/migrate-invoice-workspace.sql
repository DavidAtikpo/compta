-- À exécuter sur la base APRÈS ajout de la colonne "submittedByUserId" sur invoices
-- et AVANT suppression de enterprise_invoices si vous migrez depuis l’ancien modèle.

-- 1) Rattacher les factures des agents au compte dirigeant + conserver l’auteur
UPDATE invoices inv
SET
  "userId" = e."ownerId",
  "submittedByUserId" = inv."userId"
FROM enterprise_members em
JOIN enterprises e ON e.id = em."enterpriseId"
WHERE em."userId" = inv."userId"
  AND em.status = 'active'
  AND inv."userId" IS DISTINCT FROM e."ownerId";

-- 2) Renseigner l’auteur quand vide (vos anciennes factures = vous-même)
UPDATE invoices
SET "submittedByUserId" = "userId"
WHERE "submittedByUserId" IS NULL AND "userId" IS NOT NULL;
