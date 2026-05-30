import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  const agentClause = restrictAgentToOwnSubmissions ? ` AND "submittedByUserId" = $2` : "";
  const invParams = restrictAgentToOwnSubmissions
    ? [workspaceOwnerId, actorUserId]
    : [workspaceOwnerId];

  const [statsRes, recentRes, journalCount, bankUnmatched] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM invoices WHERE "userId" = $1 AND ("deletedAt" IS NULL)${agentClause}`,
      invParams,
    ),
    pool.query(
      `SELECT id, "originalName", region, status, category, "currency", "invoiceDate", "createdAt", "invoiceType"
       FROM invoices WHERE "userId" = $1 AND ("deletedAt" IS NULL)${agentClause}
       ORDER BY "createdAt" DESC LIMIT 5`,
      invParams,
    ),
    prisma.journalEntry.count({ where: { userId: workspaceOwnerId, deletedAt: null } }),
    prisma.bankTransaction.count({
      where: { userId: workspaceOwnerId, matchedInvoiceId: null },
    }),
  ]);

  const row = statsRes.rows[0] ?? { total: 0, sent: 0, pending: 0 };

  return NextResponse.json({
    stats: {
      invoices: Number(row.total) || 0,
      sentCount: Number(row.sent) || 0,
      pendingCount: Number(row.pending) || 0,
      journalEntries: journalCount,
      bankUnmatched,
    },
    recentInvoices: recentRes.rows,
  });
}
