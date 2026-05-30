import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { computeVatDeclaration } from "@/lib/vat-declaration";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const monthRaw = searchParams.get("month");
  const month = monthRaw != null ? Number(monthRaw) : undefined;
  const type = (searchParams.get("type") ?? (month != null ? "CA3" : "CA12")) as "CA3" | "CA12";

  let query = `
    SELECT "invoiceType", "montantHT", "montantTVA", "montantTTC", "tauxTVA", "invoiceDate", "createdAt"
    FROM invoices
    WHERE "userId" = $1 AND ("deletedAt" IS NULL) AND status != 'draft'
  `;
  const params: string[] = [workspaceOwnerId];
  if (restrictAgentToOwnSubmissions) {
    query += ` AND "submittedByUserId" = $2`;
    params.push(actorUserId);
  }

  const result = await pool.query(query, params);
  const declaration = computeVatDeclaration(result.rows, { year, month, type });

  return NextResponse.json(declaration);
}
