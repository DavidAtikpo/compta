import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const result = await pool.query(
      `SELECT i.id, i."originalName", i.region, i.amount, i.category,
              i.status, i."ocrText", i."createdAt", i."sentAt", i."fileUrl",
              i."fournisseur", i."numeroFacture", i."montantHT", i."montantTVA",
              i."montantTTC", i."tauxTVA", i."invoiceDate",
              a.email as accountant_email
       FROM invoices i
       LEFT JOIN accountants a ON i."accountantId" = a.id
       WHERE i."shareToken" = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur lecture share:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
