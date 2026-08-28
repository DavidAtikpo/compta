import { pool } from "./postgres";

export type AccountantPortalInvoiceRow = {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  montantHT: number | null;
  montantTTC: number | null;
  currency: string | null;
  category: string | null;
  invoiceType: string | null;
  fournisseur: string | null;
  numeroFacture: string | null;
  invoiceDate: string | null;
  sentAt: string | null;
  createdAt: string;
  fileUrl: string | null;
  shareToken: string | null;
  accountantReviewStatus: string | null;
  accountantReviewNote: string | null;
  accountantReviewedAt: string | null;
  clientEmail: string | null;
  clientName: string | null;
  cabinetLabel: string | null;
};

export async function listInvoicesForAccountant(
  email: string,
  opts: { currency?: string; reviewStatus?: string; limit?: number } = {},
): Promise<AccountantPortalInvoiceRow[]> {
  const normalized = email.trim().toLowerCase();
  const params: (string | number)[] = [normalized];
  let idx = 2;

  let query = `
    SELECT DISTINCT ON (i.id)
      i.id,
      i."originalName",
      i.region,
      i.status,
      i.amount,
      i."montantHT",
      i."montantTTC",
      i.currency,
      i.category,
      i."invoiceType",
      i.fournisseur,
      i."numeroFacture",
      i."invoiceDate",
      i."sentAt",
      i."createdAt",
      i."fileUrl",
      i."shareToken",
      i."accountantReviewStatus",
      i."accountantReviewNote",
      i."accountantReviewedAt",
      u.email AS "clientEmail",
      u.name AS "clientName",
      a.label AS "cabinetLabel"
    FROM invoices i
    LEFT JOIN accountants a ON i."accountantId" = a.id
    LEFT JOIN "User" u ON i."userId" = u.id
    WHERE i."deletedAt" IS NULL
      AND (
        (a.id IS NOT NULL AND LOWER(a.email) = $1)
        OR (
          i.status IN ('sent', 'archived', 'pending')
          AND EXISTS (
            SELECT 1 FROM send_history sh
            WHERE sh."userId" = i."userId"
              AND sh.region = i.region
              AND sh.success = true
              AND (
                LOWER(sh."recipientEmail") = $1
                OR LOWER(sh."recipientEmail") LIKE '%' || $1 || '%'
              )
          )
        )
      )
  `;

  if (opts.currency) {
    query += ` AND COALESCE(i.currency, 'EUR') = $${idx++}`;
    params.push(opts.currency.toUpperCase());
  }

  if (opts.reviewStatus === "pending") {
    query += ` AND (i."accountantReviewStatus" IS NULL OR i."accountantReviewStatus" = '')`;
  } else if (opts.reviewStatus === "validated" || opts.reviewStatus === "rejected") {
    query += ` AND i."accountantReviewStatus" = $${idx++}`;
    params.push(opts.reviewStatus);
  }

  query += ` ORDER BY i.id, i."sentAt" DESC NULLS LAST, i."createdAt" DESC`;

  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000);
  const wrapped = `
    SELECT * FROM (${query}) portal_invoices
    ORDER BY "sentAt" DESC NULLS LAST, "createdAt" DESC
    LIMIT $${idx}
  `;
  params.push(limit);

  const result = await pool.query(wrapped, params);
  return result.rows as AccountantPortalInvoiceRow[];
}

export async function invoiceAccessibleToAccountant(invoiceId: string, email: string): Promise<boolean> {
  const rows = await listInvoicesForAccountant(email, { limit: 1000 });
  return rows.some((r) => r.id === invoiceId);
}
