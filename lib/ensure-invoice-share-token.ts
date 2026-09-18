import { randomBytes } from "crypto";
import { pool } from "./postgres";

export async function ensureInvoiceShareToken(
  invoiceId: string,
  workspaceOwnerId: string,
): Promise<string> {
  const existing = await pool.query(
    `SELECT "shareToken" FROM invoices
     WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)`,
    [invoiceId, workspaceOwnerId],
  );
  const row = existing.rows[0] as { shareToken: string | null } | undefined;
  if (!row) throw new Error("Facture introuvable.");
  if (row.shareToken) return row.shareToken;

  const token = randomBytes(24).toString("hex");
  await pool.query(
    `UPDATE invoices SET "shareToken" = $1, "updatedAt" = NOW()
     WHERE id = $2 AND "userId" = $3 AND ("deletedAt" IS NULL)`,
    [token, invoiceId, workspaceOwnerId],
  );
  return token;
}

export async function ensureInvoiceShareTokens(
  invoiceIds: string[],
  workspaceOwnerId: string,
): Promise<void> {
  for (const id of invoiceIds) {
    await ensureInvoiceShareToken(id, workspaceOwnerId);
  }
}
