import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }
    await pool.query(`DELETE FROM accountants WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur suppression comptable:", error);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
