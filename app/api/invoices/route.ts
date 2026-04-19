import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    let query = `
      SELECT i.*, a.email as accountant_email
      FROM invoices i
      LEFT JOIN accountants a ON i."accountantId" = a.id
      WHERE i."userId" = $1
    `;
    const params: (string | number)[] = [userId];
    let idx = 2;

    if (region) {
      query += ` AND i.region = $${idx++}`;
      params.push(region);
    }
    if (status) {
      query += ` AND i.status = $${idx++}`;
      params.push(status);
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
      invoiceDate,
      fileUrl,
    } = body;

    if (!originalName || !region) {
      return NextResponse.json(
        { error: "originalName et region sont requis" },
        { status: 400 }
      );
    }

    // Comptable par défaut pour la région (liste personnelle de l’utilisateur)
    const accountantResult = await pool.query(
      `SELECT id FROM accountants WHERE region = $1 AND "userId" = $2 ORDER BY "createdAt" ASC LIMIT 1`,
      [region, userId]
    );
    const accountantId =
      accountantResult.rows.length > 0
        ? accountantResult.rows[0].id
        : null;

    const result = await pool.query(
      `INSERT INTO invoices (id, "userId", filename, "originalName", size, "mimeType", "ocrText", region, "accountantId", amount, category, status, "invoiceDate", "fileUrl", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        filename || originalName,
        originalName,
        size || 0,
        mimeType || "application/octet-stream",
        ocrText || null,
        region,
        accountantId,
        amount || null,
        category || null,
        invoiceDate || null,
        fileUrl || null,
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

export async function PATCH(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, amount, category } = body;

    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE invoices SET
        status = COALESCE($2, status),
        amount = COALESCE($3, amount),
        category = COALESCE($4, category),
        "updatedAt" = NOW()
       WHERE id = $1 AND "userId" = $5
       RETURNING *`,
      [id, status || null, amount || null, category || null, userId]
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
