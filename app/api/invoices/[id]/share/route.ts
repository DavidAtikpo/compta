import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { randomBytes } from "crypto";
import { getAuthenticatedUserId } from "../../../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);
    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $3`
      : "";
    const selParams = restrictAgentToOwnSubmissions
      ? [id, workspaceOwnerId, actorUserId]
      : [id, workspaceOwnerId];
    const existing = await pool.query(
      `SELECT "shareToken" FROM invoices WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      selParams
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    let token = existing.rows[0].shareToken;

    if (!token) {
      token = randomBytes(24).toString("hex");
      const updParams = restrictAgentToOwnSubmissions
        ? [token, id, workspaceOwnerId, actorUserId]
        : [token, id, workspaceOwnerId];
      const updClause = restrictAgentToOwnSubmissions
        ? ` AND "submittedByUserId" = $4`
        : "";
      await pool.query(
        `UPDATE invoices SET "shareToken" = $1, "updatedAt" = NOW() WHERE id = $2 AND "userId" = $3 AND ("deletedAt" IS NULL)${updClause}`,
        updParams
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return NextResponse.json({ token, url: `${baseUrl}/share/${token}` });
  } catch (error) {
    console.error("Erreur génération lien partage:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);
    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $3`
      : "";
    const updParams = restrictAgentToOwnSubmissions
      ? [id, workspaceOwnerId, actorUserId]
      : [id, workspaceOwnerId];
    const upd = await pool.query(
      `UPDATE invoices SET "shareToken" = NULL, "updatedAt" = NOW() WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      updParams
    );
    if (upd.rowCount === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression lien partage:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
