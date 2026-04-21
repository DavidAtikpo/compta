import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }
    await pool.query(`DELETE FROM accountants WHERE id = $1 AND "userId" = $2`, [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression comptable:", error);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
