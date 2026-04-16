import { NextResponse } from "next/server";
import { pool } from "../../../lib/postgres";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await pool.query(`SELECT * FROM structures ORDER BY region, name`);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur structures:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, region, type, siret } = await request.json();
    if (!name || !region || !type) {
      return NextResponse.json({ error: "name, region et type sont requis." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO structures (id, name, region, type, siret, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [name, region, type, siret ?? null]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Erreur création structure:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await pool.query(`DELETE FROM structures WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression structure:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
