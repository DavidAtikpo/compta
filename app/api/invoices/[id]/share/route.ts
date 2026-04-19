import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { randomBytes } from "crypto";
import { getAuthenticatedUserId } from "../../../../../lib/auth-request";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await pool.query(
      `SELECT "shareToken" FROM invoices WHERE id = $1 AND "userId" = $2`,
      [id, userId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    let token = existing.rows[0].shareToken;

    if (!token) {
      token = randomBytes(24).toString("hex");
      await pool.query(
        `UPDATE invoices SET "shareToken" = $1, "updatedAt" = NOW() WHERE id = $2 AND "userId" = $3`,
        [token, id, userId]
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return NextResponse.json({ token, url: `${baseUrl}/share/${token}` });
  } catch (error) {
    console.error("Erreur génération lien partage:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const upd = await pool.query(
      `UPDATE invoices SET "shareToken" = NULL, "updatedAt" = NOW() WHERE id = $1 AND "userId" = $2`,
      [id, userId]
    );
    if (upd.rowCount === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression lien partage:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
