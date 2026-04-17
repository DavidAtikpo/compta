import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  }
  try {
    const result = await pool.query(`DELETE FROM invoices WHERE id = $1 RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE invoice error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
