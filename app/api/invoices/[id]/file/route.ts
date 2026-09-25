import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { getUserIdFromJwt } from "../../../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import {
  fetchCloudinaryInvoiceBuffer,
  parseCloudinaryStoredUrl,
  resolveWorkingCloudinaryDownloadUrl,
  setupCloudinaryFromEnv,
} from "@/lib/cloudinary-invoice-asset";

export const runtime = "nodejs";
export const maxDuration = 30;

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const inline = searchParams.get("disposition") === "inline";

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  if (!JWT_SECRET) {
    return NextResponse.json({ error: "Configuration serveur." }, { status: 500 });
  }
  const userId = getUserIdFromJwt(token);
  if (!userId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  try {
    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $3`
      : "";
    const selParams = restrictAgentToOwnSubmissions
      ? [id, workspaceOwnerId, actorUserId]
      : [id, workspaceOwnerId];
    const r = await pool.query(
      `SELECT "fileUrl", "originalName", "mimeType" FROM invoices WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      selParams,
    );
    const row = r.rows[0] as
      | { fileUrl: string | null; originalName: string; mimeType: string | null }
      | undefined;
    if (!row?.fileUrl) {
      return NextResponse.json({ error: "Aucun fichier pour cette facture." }, { status: 404 });
    }

    const { fileUrl, originalName, mimeType } = row;

    if (!parseCloudinaryStoredUrl(fileUrl)) {
      return NextResponse.json({ url: fileUrl });
    }

    const resolvedUrl = await resolveWorkingCloudinaryDownloadUrl(fileUrl, !inline);
    if (resolvedUrl) {
      return NextResponse.json({ url: resolvedUrl });
    }

    if (!setupCloudinaryFromEnv()) {
      return NextResponse.json({ error: "Cloudinary non configuré." }, { status: 500 });
    }

    const downloaded = await fetchCloudinaryInvoiceBuffer(fileUrl, originalName, mimeType);
    if (!downloaded) {
      return NextResponse.json({ error: "Fichier inaccessible sur Cloudinary." }, { status: 502 });
    }

    const filename = originalName || "document";
    return new Response(new Uint8Array(downloaded.buffer), {
      headers: {
        "Content-Type": downloaded.contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET invoice file:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
