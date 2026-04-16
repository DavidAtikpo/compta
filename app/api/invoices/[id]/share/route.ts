import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const existing = await pool.query(
      `SELECT "shareToken" FROM invoices WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    let token = existing.rows[0].shareToken;

    if (!token) {
      token = randomBytes(24).toString("hex");
      await pool.query(
        `UPDATE invoices SET "shareToken" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [token, id]
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await pool.query(
      `UPDATE invoices SET "shareToken" = NULL, "updatedAt" = NOW() WHERE id = $1`,
      [id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression lien partage:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
