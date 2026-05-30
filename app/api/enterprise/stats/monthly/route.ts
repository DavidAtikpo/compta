import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pool } from "@/lib/postgres";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { isEntreprisePlan } from "@/lib/plans";

type Row = { month: string; achat: string; vente: string };

function enumerateMonths(fromD: Date, toD: Date): string[] {
  const keys: string[] = [];
  const start = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
  const end = new Date(toD.getFullYear(), toD.getMonth(), 1);
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

/** Statistiques mensuelles : TTC agrégé par mois (date sur la facture, sinon date d’ajout). */
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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const toD = to ? new Date(to) : new Date();
  toD.setHours(23, 59, 59, 999);
  const fromD = from ? new Date(from) : new Date(toD);
  if (!from) {
    fromD.setFullYear(fromD.getFullYear() - 1);
    fromD.setHours(0, 0, 0, 0);
  } else {
    fromD.setHours(0, 0, 0, 0);
  }

  const agentClause = restrictAgentToOwnSubmissions
    ? ` AND i."submittedByUserId" = $4`
    : "";
  const params = restrictAgentToOwnSubmissions
    ? [workspaceOwnerId, fromD, toD, actorUserId]
    : [workspaceOwnerId, fromD, toD];

  const result = await pool.query<Row>(
    `
    SELECT
      to_char(date_trunc('month', COALESCE(i."invoiceDate", i."createdAt")), 'YYYY-MM') AS month,
      SUM(CASE WHEN COALESCE(i."invoiceType", 'achat') <> 'vente'
        THEN COALESCE(i."montantTTC", i.amount, 0)::double precision ELSE 0 END) AS achat,
      SUM(CASE WHEN i."invoiceType" = 'vente'
        THEN COALESCE(i."montantTTC", i.amount, 0)::double precision ELSE 0 END) AS vente
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

  const byMonth = new Map<string, { achat: number; vente: number }>();
  for (const r of result.rows) {
    byMonth.set(r.month, {
      achat: Number(r.achat) || 0,
      vente: Number(r.vente) || 0,
    });
  }

  const months = enumerateMonths(fromD, toD);
  const series = months.map((month) => ({
    month,
    achat: byMonth.get(month)?.achat ?? 0,
    vente: byMonth.get(month)?.vente ?? 0,
  }));

  return NextResponse.json({ series, from: fromD.toISOString(), to: toD.toISOString() });
}
