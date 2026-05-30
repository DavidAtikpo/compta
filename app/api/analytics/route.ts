import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  const { searchParams } = new URL(request.url);
  const fromD = searchParams.get("from")
    ? new Date(searchParams.get("from")!)
    : new Date(Date.now() - 90 * 86400000);
  const toD = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();

  const agentClause = restrictAgentToOwnSubmissions ? ` AND "submittedByUserId" = $4` : "";
  const params = restrictAgentToOwnSubmissions
    ? [workspaceOwnerId, fromD, toD, actorUserId]
    : [workspaceOwnerId, fromD, toD];

  const result = await pool.query<{
    date: string;
    achat: string;
    vente: string;
    count: string;
  }>(
    `
    SELECT
      to_char(date_trunc('day', COALESCE(i."invoiceDate", i."createdAt")), 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS count,
      SUM(CASE WHEN COALESCE(i."invoiceType", 'achat') <> 'vente' THEN 1 ELSE 0 END)::int AS achat,
      SUM(CASE WHEN i."invoiceType" = 'vente' THEN 1 ELSE 0 END)::int AS vente
    FROM invoices i
    WHERE i."userId" = $1
      AND (i."deletedAt" IS NULL)
      AND COALESCE(i."invoiceDate", i."createdAt") >= $2
      AND COALESCE(i."invoiceDate", i."createdAt") <= $3${agentClause}
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    params,
  );

  const byCategory = await pool.query<{ category: string; count: string }>(
    `
    SELECT COALESCE(category, 'Non classé') AS category, COUNT(*)::int AS count
    FROM invoices
    WHERE "userId" = $1 AND ("deletedAt" IS NULL)${agentClause.replace("$4", "$2")}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `,
    restrictAgentToOwnSubmissions ? [workspaceOwnerId, actorUserId] : [workspaceOwnerId],
  );

  const series = result.rows.map((r) => ({
    date: r.date,
    achat: Number(r.achat) || 0,
    vente: Number(r.vente) || 0,
    count: Number(r.count) || 0,
  }));

  return NextResponse.json({
    series,
    byCategory: byCategory.rows.map((r) => ({
      category: r.category,
      count: Number(r.count) || 0,
    })),
    from: fromD.toISOString(),
    to: toD.toISOString(),
  });
}
