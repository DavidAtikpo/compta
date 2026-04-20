import { NextResponse } from "next/server";
import { pool } from "../../../lib/postgres";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, region, email, label, "createdAt", "updatedAt"
       FROM accountants
       ORDER BY region ASC, "createdAt" ASC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur récupération comptables:", error);
    return NextResponse.json({ error: "Erreur récupération comptables" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const region = typeof body.region === "string" ? body.region.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const label =
      typeof body.label === "string" && body.label.trim() !== ""
        ? body.label.trim()
        : null;

    if (!region || !email) {
      return NextResponse.json({ error: "Region et email requis" }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO accountants (id, region, email, label, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT (region, email) DO UPDATE SET
         label = COALESCE(EXCLUDED.label, accountants.label),
         "updatedAt" = NOW()
       RETURNING *`,
      [region, email, label]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur sauvegarde comptable:", error);
    return NextResponse.json(
      { error: "Erreur sauvegarde comptable (email déjà présent pour ce pays ?)" },
      { status: 500 }
    );
  }
}
