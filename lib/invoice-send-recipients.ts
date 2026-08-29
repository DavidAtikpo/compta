import { pool } from "./postgres";

let tableReady: Promise<void> | null = null;

export async function ensureInvoiceSendRecipientsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS invoice_send_recipients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "invoiceId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          email VARCHAR(255) NOT NULL,
          "accountantId" TEXT,
          "sentAt" TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE ("invoiceId", email)
        );
        CREATE INDEX IF NOT EXISTS invoice_send_recipients_invoice_idx
          ON invoice_send_recipients ("invoiceId");
        CREATE INDEX IF NOT EXISTS invoice_send_recipients_user_idx
          ON invoice_send_recipients ("userId");
      `)
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  await tableReady;
}

export async function persistInvoiceSendRecipients(
  userId: string,
  invoiceIds: string[],
  recipientEmails: string[],
  sentAt: Date = new Date(),
): Promise<void> {
  if (invoiceIds.length === 0 || recipientEmails.length === 0) return;
  await ensureInvoiceSendRecipientsTable();

  const normalizedEmails = [
    ...new Set(recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalizedEmails.length === 0) return;

  for (const invoiceId of invoiceIds) {
    for (const email of normalizedEmails) {
      const accRes = await pool.query(
        `SELECT id FROM accountants
         WHERE "userId" = $1 AND LOWER(email) = LOWER($2) AND "deletedAt" IS NULL
         ORDER BY "createdAt" ASC LIMIT 1`,
        [userId, email],
      );
      const accountantId = accRes.rows[0]?.id ?? null;
      await pool.query(
        `INSERT INTO invoice_send_recipients ("invoiceId", "userId", email, "accountantId", "sentAt")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("invoiceId", email) DO UPDATE SET
           "sentAt" = EXCLUDED."sentAt",
           "accountantId" = COALESCE(EXCLUDED."accountantId", invoice_send_recipients."accountantId")`,
        [invoiceId, userId, email, accountantId, sentAt],
      );
    }
  }
}

export async function loadInvoiceSendRecipientsMap(
  ownerUserId: string,
  invoiceIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (invoiceIds.length === 0) return map;

  try {
    await ensureInvoiceSendRecipientsTable();
    const result = await pool.query(
      `SELECT "invoiceId", LOWER(email) AS email
       FROM invoice_send_recipients
       WHERE "userId" = $1 AND "invoiceId" = ANY($2::text[])
       ORDER BY "sentAt" ASC`,
      [ownerUserId, invoiceIds],
    );
    for (const row of result.rows as { invoiceId: string; email: string }[]) {
      const list = map.get(row.invoiceId) ?? [];
      if (!list.includes(row.email)) list.push(row.email);
      map.set(row.invoiceId, list);
    }
  } catch (err) {
    console.warn("invoice_send_recipients unavailable:", (err as Error).message);
  }
  return map;
}
