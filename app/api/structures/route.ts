import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM structures WHERE "userId" = $1 ORDER BY region, name`,
      [userId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur structures:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const { name, region, type, siret } = await request.json();
    if (!name || !region || !type) {
      return NextResponse.json({ error: "name, region et type sont requis." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO structures (id, "userId", name, region, type, siret, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [userId, name, region, type, siret ?? null]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Erreur création structure:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id requis." }, { status: 400 });
    }
    const r = await pool.query(
      `DELETE FROM structures WHERE id = $1 AND "userId" = $2 RETURNING id`,
      [id, userId]
    );
    if (r.rowCount === 0) {
      return NextResponse.json({ error: "Non trouvé ou accès refusé." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression structure:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
