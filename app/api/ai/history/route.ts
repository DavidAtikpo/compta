import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";
import { pool } from "../../../../lib/postgres";

/** Historique des réponses du conseiller fiscal IA (table `ai_optimizations`), filtré par utilisateur connecté. */
export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "200", 10)));

  try {
    let query = `
      SELECT id, "invoiceId", prompt, response, region, "createdAt"
      FROM ai_optimizations
      WHERE "userId" = $1
    `;
    const params: (string | number)[] = [userId];
    let idx = 2;

    if (region) {
      query += ` AND region = $${idx++}`;
      params.push(region);
    }

    query += ` ORDER BY "createdAt" DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Erreur récupération historique IA:", error);
    return NextResponse.json(
      { error: "Erreur récupération historique IA" },
      { status: 500 },
    );
  }
}

/** Supprime une entrée ou tout l'historique IA de l'utilisateur connecté. */
export async function DELETE(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const allQuery = searchParams.get("all");

    let body: { all?: boolean } = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text) as { all?: boolean };
    } catch {
      /* query-only delete */
    }

    const deleteAll = body.all === true || allQuery === "1" || allQuery === "true";

    if (deleteAll) {
      const r = await pool.query(
        `DELETE FROM ai_optimizations WHERE "userId" = $1`,
        [userId],
      );
      return NextResponse.json({ deleted: r.rowCount ?? 0 });
    }

    if (id) {
      const r = await pool.query(
        `DELETE FROM ai_optimizations WHERE id = $1 AND "userId" = $2`,
        [id, userId],
      );
      if (r.rowCount === 0) {
        return NextResponse.json({ error: "Entrée introuvable." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Paramètre id ou body { \"all\": true } requis." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Erreur suppression historique IA:", error);
    return NextResponse.json(
      { error: "Erreur suppression historique IA" },
      { status: 500 },
    );
  }
}
