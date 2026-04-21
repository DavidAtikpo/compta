import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";
import { pool } from "../../../../lib/postgres";
import { SQL_TABLES } from "../../../../lib/sql-tables";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const [balanceRes, usageRes] = await Promise.all([
    pool.query(
      `SELECT "aiCreditsBalance", "billingPlan" FROM ${SQL_TABLES.user} WHERE id = $1 LIMIT 1`,
      [userId],
    ),
    pool.query(
      `SELECT provider, model, "inputTokens", "outputTokens", "estimatedCost", "creditsDebited", "createdAt"
       FROM ${SQL_TABLES.aiUsageLogs}
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 30`,
      [userId],
    ),
  ]);

  const user = balanceRes.rows[0];
  return NextResponse.json({
    balance: Number(user?.aiCreditsBalance ?? 0),
    plan: String(user?.billingPlan ?? "starter"),
    usage: usageRes.rows,
  });
}
