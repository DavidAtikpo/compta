import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  try {
    let query = `
      SELECT id, region, "recipientEmail", message, "filesCount", "sentAt", success, error
      FROM send_history
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let idx = 1;

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

export async function GET_STATS() {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as success_count,
        COUNT(*) FILTER (WHERE success = false) as failure_count,
        SUM("filesCount") as total_files
      FROM send_history
    `);
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur stats historique:", error);
    return NextResponse.json(
      { error: "Erreur stats historique" },
      { status: 500 }
    );
  }
}
