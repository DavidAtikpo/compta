import { NextResponse } from "next/server";
import { pool } from "../../../lib/postgres";

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT region, email, "createdAt", "updatedAt" FROM accountants ORDER BY "createdAt" DESC'
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
    const { region, email } = body;

    if (!region || !email) {
      return NextResponse.json({ error: "Region et email requis" }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO accountants (region, email, "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (region) DO UPDATE SET
         email = EXCLUDED.email,
         "updatedAt" = NOW()
       RETURNING *`,
      [region, email]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur sauvegarde comptable:", error);
    return NextResponse.json({ error: "Erreur sauvegarde comptable" }, { status: 500 });
  }
}
