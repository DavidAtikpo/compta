import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";
import { pool } from "../../../../lib/postgres";
import { SQL_TABLES } from "../../../../lib/sql-tables";

const PACKS: Record<string, { credits: number; amountEur: number }> = {
  "pack-10": { credits: 1000, amountEur: 10 },
  "pack-25": { credits: 2800, amountEur: 25 },
  "pack-50": { credits: 6000, amountEur: 50 },
};

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const packId = String(body?.packId || "");
  const paymentReference = String(body?.paymentReference || "");
  const pack = PACKS[packId];

  if (!pack) {
    return NextResponse.json({ error: "Pack invalide." }, { status: 400 });
  }

  // NOTE: endpoint ready for Stripe webhook integration.
  // For now, a non-empty paymentReference simulates a verified payment id.
  if (!paymentReference.trim()) {
    return NextResponse.json(
      { error: "Paiement non confirmé. Fournissez une référence de paiement." },
      { status: 400 },
    );
  }

  const updateRes = await pool.query(
    `UPDATE ${SQL_TABLES.user}
     SET "aiCreditsBalance" = "aiCreditsBalance" + $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING "aiCreditsBalance"`,
    [userId, pack.credits],
  );

  await pool.query(
    `INSERT INTO ${SQL_TABLES.billingEvents} (id, "userId", type, credits, "amountEur", status, reference, metadata, "createdAt")
     VALUES (gen_random_uuid(), $1, 'topup', $2, $3, 'succeeded', $4, $5, NOW())`,
    [userId, pack.credits, pack.amountEur, paymentReference, JSON.stringify({ packId })],
  );

  return NextResponse.json({
    ok: true,
    addedCredits: pack.credits,
    amountEur: pack.amountEur,
    balance: Number(updateRes.rows[0]?.aiCreditsBalance ?? 0),
  });
}
