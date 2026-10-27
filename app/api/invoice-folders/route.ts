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

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    await ensureInvoiceFoldersSchema();
    const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);

    const foldersRes = await pool.query(
      `SELECT f.id, f.name, f."createdAt", f."updatedAt",
        (
          SELECT COUNT(*)::int
          FROM invoices i
          WHERE i."folderId" = f.id
            AND i."userId" = $1
            AND i."deletedAt" IS NULL
            AND i."fileUrl" IS NOT NULL
        ) AS "fileCount"
       FROM invoice_folders f
       WHERE f."userId" = $1
       ORDER BY LOWER(f.name) ASC, f."createdAt" ASC`,
      [workspaceOwnerId],
    );

    const uncategorizedRes = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM invoices i
       WHERE i."userId" = $1
         AND i."deletedAt" IS NULL
         AND i."fileUrl" IS NOT NULL
         AND i."folderId" IS NULL`,
      [workspaceOwnerId],
    );

    return NextResponse.json({
      folders: foldersRes.rows,
      uncategorizedCount: uncategorizedRes.rows[0]?.c ?? 0,
    });
  } catch (error) {
    console.error("GET invoice-folders:", error);
    return NextResponse.json({ error: "Erreur chargement dossiers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    await ensureInvoiceFoldersSchema();
    const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
    const body = await request.json().catch(() => ({}));
    const name = normalizeFolderName(body?.name);
    if (!name) {
      return NextResponse.json({ error: "Nom de dossier invalide (1–255 caractères)." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO invoice_folders ("userId", name, "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, name, "createdAt", "updatedAt"`,
      [workspaceOwnerId, name],
    );

    return NextResponse.json({ ...result.rows[0], fileCount: 0 });
  } catch (error) {
    console.error("POST invoice-folders:", error);
    return NextResponse.json({ error: "Erreur création dossier" }, { status: 500 });
  }
}
