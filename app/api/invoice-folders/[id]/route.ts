import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { ensureInvoiceFoldersSchema } from "@/lib/invoice-folders-schema";

function normalizeFolderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || name.length > 255) return null;
  return name;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    await ensureInvoiceFoldersSchema();
    const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
    const body = await request.json().catch(() => ({}));
    const name = normalizeFolderName(body?.name);
    if (!name) {
      return NextResponse.json({ error: "Nom de dossier invalide." }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE invoice_folders SET name = $1, "updatedAt" = NOW()
       WHERE id = $2 AND "userId" = $3
       RETURNING id, name, "createdAt", "updatedAt"`,
      [name, id, workspaceOwnerId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("PATCH invoice-folder:", error);
    return NextResponse.json({ error: "Erreur renommage dossier" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    await ensureInvoiceFoldersSchema();
    const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);

    const result = await pool.query(
      `DELETE FROM invoice_folders WHERE id = $1 AND "userId" = $2 RETURNING id`,
      [id, workspaceOwnerId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE invoice-folder:", error);
    return NextResponse.json({ error: "Erreur suppression dossier" }, { status: 500 });
  }
}
