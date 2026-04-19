import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  try {
    let query = `
      SELECT id, region, "recipientEmail", message, "filesCount", "sentAt", success, error
      FROM send_history
      WHERE "userId" = $1
    `;
    const params: (string | number)[] = [userId];
    let idx = 2;

    if (region) {
      query += ` AND region = $${idx++}`;
      params.push(region);
    }

    query += ` ORDER BY "sentAt" DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur récupération historique:", error);
    return NextResponse.json(
      { error: "Erreur récupération historique" },
      { status: 500 }
    );
  }
}
