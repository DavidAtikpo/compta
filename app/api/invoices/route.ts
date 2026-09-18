import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { isOcrTextQualityGood } from "@/lib/ocr-quality";
import { ensureInvoiceWorkflowColumns } from "@/lib/invoice-workflow-schema";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const status = searchParams.get("status");
  const currency = searchParams.get("currency");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    await ensureInvoiceWorkflowColumns();
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);

    let query = `
      SELECT i.*,
        COALESCE(
          a.email,
          (
            SELECT TRIM(SPLIT_PART(sh."recipientEmail", ',', 1))
            FROM send_history sh
            WHERE sh."userId" = i."userId"
              AND sh.region = i.region
              AND sh.success = true
              AND i."sentAt" IS NOT NULL
            ORDER BY ABS(EXTRACT(EPOCH FROM (i."sentAt" - sh."sentAt")))
            LIMIT 1
          )
        ) AS accountant_email,
        COALESCE(
          a.label,
          (
            SELECT ac.label
            FROM accountants ac
            WHERE ac."userId" = i."userId"
              AND ac."deletedAt" IS NULL
              AND LOWER(ac.email) = LOWER(
                COALESCE(
                  a.email,
                  (
                    SELECT TRIM(SPLIT_PART(sh."recipientEmail", ',', 1))
                    FROM send_history sh
                    WHERE sh."userId" = i."userId"
                      AND sh.region = i.region
                      AND sh.success = true
                      AND i."sentAt" IS NOT NULL
                    ORDER BY ABS(EXTRACT(EPOCH FROM (i."sentAt" - sh."sentAt")))
                    LIMIT 1
                  )
                )
              )
            LIMIT 1
          )
        ) AS accountant_label,
        su.email as "submittedByEmail",
        su.name as "submittedByName"
      FROM invoices i
      LEFT JOIN accountants a ON i."accountantId" = a.id
      LEFT JOIN "User" su ON i."submittedByUserId" = su.id
      WHERE i."userId" = $1 AND (i."deletedAt" IS NULL)
    `;
    const params: (string | number)[] = [workspaceOwnerId];
    let idx = 2;

    if (restrictAgentToOwnSubmissions) {
      query += ` AND i."submittedByUserId" = $${idx++}`;
      params.push(actorUserId);
    }

    if (region) {
      query += ` AND i.region = $${idx++}`;
      params.push(region);
    }
    if (status) {
      query += ` AND i.status = $${idx++}`;
      params.push(status);
    }
    if (currency) {
      query += ` AND COALESCE(i.currency, 'EUR') = $${idx++}`;
      params.push(currency.toUpperCase());
    }

    query += ` ORDER BY i."createdAt" DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur récupération factures:", error);
    return NextResponse.json(
      { error: "Erreur récupération factures" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const { workspaceOwnerId, actorUserId } = await resolveInvoiceWorkspace(userId);

    const body = await request.json();
    const {
      filename,
      originalName,
      size,
      mimeType,
      ocrText,
      region,
      amount,
      category,
      invoiceType,
      structureId,
      invoiceDate,
      fileUrl,
      currency,
    } = body;

    if (!originalName || !region) {
      return NextResponse.json(
        { error: "originalName et region sont requis" },
        { status: 400 }
      );
    }

    const normalizedRegion = String(region).trim().toLowerCase();

    const accountantResult = await pool.query(
      `SELECT id FROM accountants
       WHERE LOWER(TRIM(region)) = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)
       ORDER BY "createdAt" ASC LIMIT 1`,
      [normalizedRegion, workspaceOwnerId],
    );
    const accountantId =
      accountantResult.rows.length > 0
        ? accountantResult.rows[0].id
        : null;

    const normalizedInvoiceType =
      typeof invoiceType === "string" && invoiceType.toLowerCase() === "vente"
        ? "vente"
        : "achat";

    const VALID_CURRENCIES = ["EUR", "GBP", "USD", "CNY", "GHS", "XAF", "XOF"];
    const normalizedCurrency =
      typeof currency === "string" && VALID_CURRENCIES.includes(currency.toUpperCase())
        ? currency.toUpperCase()
        : "EUR";

    const result = await pool.query(
      `INSERT INTO invoices (id, "userId", "submittedByUserId", filename, "originalName", size, "mimeType", "ocrText", region, "accountantId", amount, category, "invoiceType", "structureId", status, "invoiceDate", "fileUrl", currency, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, $15, $16, NOW(), NOW())
       RETURNING *`,
      [
        workspaceOwnerId,
        actorUserId,
        filename || originalName,
        originalName,
        size || 0,
        mimeType || "application/octet-stream",
        typeof ocrText === "string" && isOcrTextQualityGood(ocrText) ? ocrText : null,
        normalizedRegion,
        accountantId,
        amount || null,
        category || null,
        normalizedInvoiceType,
        structureId || null,
        invoiceDate || null,
        fileUrl || null,
        normalizedCurrency,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Erreur création facture:", error);
    return NextResponse.json(
      { error: "Erreur création facture" },
      { status: 500 }
    );
  }
}

function parsePatchAmount(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

export async function PATCH(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);
    const body = await request.json();
    const { id, status, amount, category, isPaid, paidDate, currency, montantHT, montantTTC } = body;

    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    const VALID_CURRENCIES = ["EUR", "GBP", "USD", "CNY", "GHS", "XAF", "XOF"];
    const normalizedCurrency =
      typeof currency === "string" && VALID_CURRENCIES.includes(currency.toUpperCase())
        ? currency.toUpperCase()
        : null;

    const sets: string[] = ['"updatedAt" = NOW()'];
    const patchParams: (string | number | Date | boolean | null)[] = [];
    let idx = 1;

    const pushCoalesce = (column: string, value: unknown) => {
      if (value === undefined) return;
      sets.push(`${column} = COALESCE($${idx++}, ${column})`);
      patchParams.push(value as string | number | Date | boolean | null);
    };

    const pushDirect = (column: string, value: unknown) => {
      sets.push(`${column} = $${idx++}`);
      patchParams.push(value as string | number | Date | boolean | null);
    };

    pushCoalesce("status", status ?? null);
    pushCoalesce("category", category ?? null);
    pushCoalesce(`"isPaid"`, typeof isPaid === "boolean" ? isPaid : null);
    pushCoalesce(`"paidDate"`, paidDate ? new Date(String(paidDate)) : paidDate === null ? null : undefined);
    pushCoalesce("currency", normalizedCurrency);

    if ("montantHT" in body) {
      const ht = parsePatchAmount(montantHT);
      if (ht === "invalid") {
        return NextResponse.json({ error: "Montant HT invalide." }, { status: 400 });
      }
      pushDirect('"montantHT"', ht);
    }

    if ("montantTTC" in body) {
      const ttc = parsePatchAmount(montantTTC);
      if (ttc === "invalid") {
        return NextResponse.json({ error: "Montant TTC invalide." }, { status: 400 });
      }
      pushDirect('"montantTTC"', ttc);
      pushDirect("amount", ttc);
    } else if (amount !== undefined) {
      const amt = parsePatchAmount(amount);
      if (amt === "invalid") {
        return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
      }
      pushCoalesce("amount", amt);
    }

    const idParam = idx++;
    const userParam = idx++;
    patchParams.push(id, workspaceOwnerId);

    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $${idx++}`
      : "";
    if (restrictAgentToOwnSubmissions) {
      patchParams.push(actorUserId);
    }

    const result = await pool.query(
      `UPDATE invoices SET ${sets.join(", ")}
       WHERE id = $${idParam} AND "userId" = $${userParam} AND ("deletedAt" IS NULL)${agentClause}
       RETURNING *`,
      patchParams,
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Facture introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur mise à jour facture:", error);
    return NextResponse.json(
      { error: "Erreur mise à jour facture" },
      { status: 500 }
    );
  }
}
