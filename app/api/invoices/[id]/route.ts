import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  }
  try {
    const result = await pool.query(
      `DELETE FROM invoices WHERE id = $1 AND "userId" = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE invoice error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
