import { pool } from "./postgres";
import {
  ensureInvoiceSendRecipientsTable,
  loadInvoiceSendRecipientsMap,
  persistInvoiceSendRecipients,
} from "./invoice-send-recipients";

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
  cabinetEmail: string | null;
  enterpriseId: string | null;
  enterpriseName: string | null;
  enterpriseSiret: string | null;
  structureName: string | null;
  ownerUserId: string | null;
  recipientCabinetEmails?: string[];
};

export type OwnerCabinetRow = {
  id: string;
  email: string;
  label: string | null;
  region: string;
};

type SendHistoryRow = { region: string; recipientEmail: string; sentAt: string | Date; filesCount?: number };

function normalizeRegionKey(region: string): string {
  return String(region || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function regionsMatch(a: string, b: string): boolean {
  return normalizeRegionKey(a) === normalizeRegionKey(b);
}

function parseRecipientList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Fenêtre élargie : sentAt facture et historique peuvent diverger de plusieurs minutes. */
const SEND_MATCH_WINDOW_MS = 30 * 60 * 1000;

function invoiceRecipientEmailsFromHistory(
  inv: {
    id: string;
    region: string;
    sentAt: string | Date | null;
    cabinetEmail: string | null;
  },
  sendHistory: SendHistoryRow[],
  allInvoiceSentTimes: { id: string; region: string; sentAt: string | Date | null }[],
): string[] {
  const emails = new Set<string>();
  if (inv.cabinetEmail) emails.add(String(inv.cabinetEmail).trim().toLowerCase());
  if (!inv.sentAt) return [...emails];

  const sentMs = new Date(inv.sentAt).getTime();
  if (Number.isNaN(sentMs)) return [...emails];

  let bestMatch: { distance: number; recipients: string[] } | null = null;

  for (const sh of sendHistory) {
    if (!regionsMatch(sh.region, inv.region)) continue;
    const shMs = new Date(sh.sentAt).getTime();
    if (Number.isNaN(shMs)) continue;
    const distance = Math.abs(shMs - sentMs);
    if (distance > SEND_MATCH_WINDOW_MS) continue;

    const recipients = parseRecipientList(sh.recipientEmail);
    if (recipients.length === 0) continue;

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { distance, recipients };
    }
  }

  if (bestMatch) {
    for (const e of bestMatch.recipients) emails.add(e);
    return [...emails];
  }

  // Dernier recours : envoi groupé — même fenêtre temporelle, autres factures même lot
  for (const sh of sendHistory) {
    if (!regionsMatch(sh.region, inv.region)) continue;
    const shMs = new Date(sh.sentAt).getTime();
    if (Number.isNaN(shMs)) continue;
    const recipients = parseRecipientList(sh.recipientEmail);
    if (recipients.length === 0) continue;

    const batchMates = allInvoiceSentTimes.filter((other) => {
      if (other.id === inv.id || !other.sentAt) return false;
      if (!regionsMatch(other.region, inv.region)) return false;
      const otherMs = new Date(other.sentAt).getTime();
      if (Number.isNaN(otherMs)) return false;
      return Math.abs(otherMs - shMs) <= SEND_MATCH_WINDOW_MS;
    });

    if (batchMates.some((m) => m.id === inv.id) || Math.abs(shMs - sentMs) <= SEND_MATCH_WINDOW_MS) {
      for (const e of recipients) emails.add(e);
    }
  }

  return [...emails];
}

/** Attribue les destinataires à toutes les factures d'un même lot d'envoi (filesCount + sentAt). */
function batchRecipientsFromHistory(
  rows: { id: string; region: string; sentAt: string | Date | null; cabinetEmail: string | null }[],
  sendHistory: SendHistoryRow[],
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();

  for (const inv of rows) {
    if (inv.cabinetEmail) {
      const set = map.get(inv.id) ?? new Set<string>();
      set.add(String(inv.cabinetEmail).trim().toLowerCase());
      map.set(inv.id, set);
    }
  }

  for (const sh of sendHistory) {
    const recipients = parseRecipientList(sh.recipientEmail);
    if (recipients.length === 0) continue;
    const shMs = new Date(sh.sentAt).getTime();
    if (Number.isNaN(shMs)) continue;

    const candidates = rows
      .filter((inv) => {
        if (!inv.sentAt || !regionsMatch(inv.region, sh.region)) return false;
        const invMs = new Date(inv.sentAt).getTime();
        return !Number.isNaN(invMs) && Math.abs(invMs - shMs) <= SEND_MATCH_WINDOW_MS;
      })
      .sort(
        (a, b) =>
          Math.abs(new Date(a.sentAt!).getTime() - shMs) -
          Math.abs(new Date(b.sentAt!).getTime() - shMs),
      );

    const filesCount = sh.filesCount && sh.filesCount > 0 ? sh.filesCount : candidates.length;
    const targets = candidates.slice(0, filesCount);

    for (const inv of targets) {
      const set = map.get(inv.id) ?? new Set<string>();
      for (const e of recipients) set.add(e);
      map.set(inv.id, set);
    }
  }

  return new Map([...map.entries()].map(([id, set]) => [id, [...set]]));
}

export async function listCabinetsForOwner(ownerUserId: string): Promise<OwnerCabinetRow[]> {
  const result = await pool.query(
    `SELECT id, email, label, region
     FROM accountants
     WHERE "userId" = $1 AND "deletedAt" IS NULL
     ORDER BY region ASC, "createdAt" ASC`,
    [ownerUserId],
  );
  return result.rows as OwnerCabinetRow[];
}

export async function listInvoicesForOwnerPortal(
  ownerUserId: string,
  opts: { currency?: string; reviewStatus?: string; limit?: number } = {},
): Promise<AccountantPortalInvoiceRow[]> {
  try {
    await ensureInvoiceSendRecipientsTable();
  } catch {
    /* continue with heuristiques send_history */
  }
  const params: (string | number)[] = [ownerUserId];
  let idx = 2;

  let query = `
    SELECT
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
      a.label AS "cabinetLabel",
      a.email AS "cabinetEmail",
      e.id AS "enterpriseId",
      e.name AS "enterpriseName",
      e.siret AS "enterpriseSiret",
      s.name AS "structureName",
      i."userId" AS "ownerUserId"
    FROM invoices i
    LEFT JOIN accountants a ON i."accountantId" = a.id
    LEFT JOIN "User" u ON i."userId" = u.id
    LEFT JOIN enterprises e ON e."ownerId" = i."userId"
    LEFT JOIN structures s ON s.id = i."structureId" AND s."deletedAt" IS NULL
    WHERE i."userId" = $1 AND i."deletedAt" IS NULL
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

  query += ` ORDER BY i."sentAt" DESC NULLS LAST, i."createdAt" DESC`;

  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000);
  query += ` LIMIT $${idx++}`;
  params.push(limit);

  const [invoicesRes, historyRes, cabinets] = await Promise.all([
    pool.query(query, params),
    pool.query(
      `SELECT region, "recipientEmail", "sentAt", "filesCount"
       FROM send_history
       WHERE "userId" = $1 AND success = true
       ORDER BY "sentAt" DESC`,
      [ownerUserId],
    ),
    listCabinetsForOwner(ownerUserId),
  ]);

  const cabinetByEmail = new Map(cabinets.map((c) => [c.email.trim().toLowerCase(), c]));
  const history = historyRes.rows as SendHistoryRow[];
  const rows = invoicesRes.rows as AccountantPortalInvoiceRow[];
  const persistedMap = await loadInvoiceSendRecipientsMap(
    ownerUserId,
    rows.map((r) => r.id),
  );

  const batchMap = batchRecipientsFromHistory(rows, history);

  const enriched = rows.map((inv) => {
    const persisted = persistedMap.get(inv.id) ?? [];
    const fromBatch = batchMap.get(inv.id) ?? [];
    const fromHistory =
      persisted.length > 0
        ? persisted
        : fromBatch.length > 0
          ? fromBatch
          : invoiceRecipientEmailsFromHistory(inv, history, rows.map((r) => ({
              id: r.id,
              region: r.region,
              sentAt: r.sentAt,
            })));

    const recipients = [...new Set(fromHistory.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const primaryEmail = recipients[0] ?? inv.cabinetEmail;
    const cab = primaryEmail ? cabinetByEmail.get(String(primaryEmail).trim().toLowerCase()) : undefined;
    return {
      ...inv,
      cabinetEmail: primaryEmail ?? inv.cabinetEmail,
      cabinetLabel: cab?.label ?? inv.cabinetLabel,
      recipientCabinetEmails: recipients,
    };
  });

  // Rétro-enregistrement pour les envois antérieurs (sans table invoice_send_recipients)
  void (async () => {
    try {
      for (const inv of enriched) {
        if ((persistedMap.get(inv.id)?.length ?? 0) > 0) continue;
        if (!inv.sentAt || !inv.recipientCabinetEmails?.length) continue;
        await persistInvoiceSendRecipients(
          ownerUserId,
          [inv.id],
          inv.recipientCabinetEmails,
          new Date(inv.sentAt),
        );
      }
    } catch (e) {
      console.warn("Backfill invoice_send_recipients:", (e as Error).message);
    }
  })();

  return enriched;
}

export async function invoiceAccessibleInPortal(
  invoiceId: string,
  ctx: { mode: "owner"; ownerUserId: string } | { mode: "cabinet"; email: string },
): Promise<boolean> {
  if (ctx.mode === "owner") {
    const result = await pool.query(
      `SELECT 1 FROM invoices WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [invoiceId, ctx.ownerUserId],
    );
    return result.rows.length > 0;
  }
  return invoiceAccessibleToAccountant(invoiceId, ctx.email);
}

export async function listInvoicesForAccountant(
  email: string,
  opts: { currency?: string; reviewStatus?: string; limit?: number } = {},
): Promise<AccountantPortalInvoiceRow[]> {
  try {
    await ensureInvoiceSendRecipientsTable();
  } catch {
    /* table optionnelle pour requêtes legacy */
  }
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
      a.label AS "cabinetLabel",
      a.email AS "cabinetEmail",
      e.id AS "enterpriseId",
      e.name AS "enterpriseName",
      e.siret AS "enterpriseSiret",
      s.name AS "structureName",
      i."userId" AS "ownerUserId"
    FROM invoices i
    LEFT JOIN accountants a ON i."accountantId" = a.id
    LEFT JOIN "User" u ON i."userId" = u.id
    LEFT JOIN enterprises e ON e."ownerId" = i."userId"
    LEFT JOIN structures s ON s.id = i."structureId" AND s."deletedAt" IS NULL
    WHERE i."deletedAt" IS NULL
      AND (
        (a.id IS NOT NULL AND LOWER(a.email) = $1)
        OR (
          i.status IN ('sent', 'archived', 'pending')
          AND EXISTS (
            SELECT 1 FROM send_history sh
            WHERE sh."userId" = i."userId"
              AND LOWER(TRIM(sh.region)) = LOWER(TRIM(i.region))
              AND sh.success = true
              AND (
                LOWER(sh."recipientEmail") = $1
                OR LOWER(sh."recipientEmail") LIKE '%' || $1 || '%'
              )
          )
        )
        OR EXISTS (
          SELECT 1 FROM invoice_send_recipients isr
          WHERE isr."invoiceId" = i.id
            AND LOWER(isr.email) = $1
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
