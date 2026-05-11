import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/postgres";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";
import { prisma } from "@/lib/prisma";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { isEntreprisePlan } from "@/lib/plans";

/**
 * Liste paginée des factures du compte entreprise (même jeu que /api/invoices, avec auteur).
 */
export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);
  const owner = await prisma.user.findUnique({
    where: { id: workspaceOwnerId },
    select: { billingPlan: true },
  });
  if (!isEntreprisePlan(owner?.billingPlan)) {
    return NextResponse.json({ error: "Plan Entreprise requis." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "20", 10), 100);
  const submittedBy = searchParams.get("submittedByUserId") || undefined;
  const search = searchParams.get("search") || undefined;

  const offset = (page - 1) * pageSize;

  const conditions: string[] = [`i."userId" = $1`, `(i."deletedAt" IS NULL)`];
  const params: (string | number)[] = [workspaceOwnerId];
  let idx = 2;

  if (restrictAgentToOwnSubmissions) {
    conditions.push(`i."submittedByUserId" = $${idx++}`);
    params.push(actorUserId);
  } else if (submittedBy) {
    conditions.push(`i."submittedByUserId" = $${idx++}`);
    params.push(submittedBy);
  }
  if (search) {
    conditions.push(
      `(i."originalName" ILIKE $${idx} OR i."fournisseur" ILIKE $${idx} OR i."category" ILIKE $${idx})`,
    );
    params.push(`%${search}%`);
    idx++;
  }

  const whereSql = conditions.join(" AND ");

  const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM invoices i WHERE ${whereSql}`, params);
  const total = Number(countRes.rows[0]?.total ?? 0);

  const dataRes = await pool.query(
    `SELECT i.*, su.email AS "submittedByEmail", su.name AS "submittedByName"
     FROM invoices i
     LEFT JOIN "User" su ON i."submittedByUserId" = su.id
     WHERE ${whereSql}
     ORDER BY i."createdAt" DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, pageSize, offset],
  );

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
    items: dataRes.rows,
  });
}
