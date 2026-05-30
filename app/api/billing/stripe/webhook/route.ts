import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { pool } from "@/lib/postgres";
import { SQL_TABLES } from "@/lib/sql-tables";
import { prisma } from "@/lib/prisma";
import { TEAM_MODE_UI } from "@/lib/plans";

export const runtime = "nodejs";

function creditsFromUsdCents(usdCents: number): number {
  return usdCents * 5;
}

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as { id: string; payment_status?: string; metadata?: Record<string, string> };
  if (session.payment_status && session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const checkoutKind = session.metadata?.checkoutKind || "credits";

  if (checkoutKind === "plan") {
    const userId = session.metadata?.userId;
    const planRaw = (session.metadata?.plan || "").toLowerCase();
    const plan = planRaw === "entreprise" ? "entreprise" : planRaw === "pro" ? "pro" : null;
    if (!userId || !plan) {
      return NextResponse.json({ error: "Metadata plan manquante." }, { status: 400 });
    }

    const reference = `stripe:plan:${session.id}`;
    const existing = await pool.query(
      `SELECT id FROM ${SQL_TABLES.billingEvents} WHERE reference = $1 LIMIT 1`,
      [reference],
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { billingPlan: plan },
    });

    if (plan === "entreprise") {
      const has = await prisma.enterprise.findFirst({ where: { ownerId: userId } });
      if (!has) {
        await prisma.enterprise.create({
          data: { ownerId: userId, name: TEAM_MODE_UI.workspaceDraftName, siret: null },
        });
      }
    }

    const amountUsdCents = Number(session.metadata?.amountUsdCents || 0);
    const amountUsd = Number.isFinite(amountUsdCents) ? amountUsdCents / 100 : null;

    await pool.query(
      `INSERT INTO ${SQL_TABLES.billingEvents} (id, "userId", type, credits, "amountEur", status, reference, metadata, "createdAt")
       VALUES (gen_random_uuid(), $1, 'plan_purchase', 0, $2, 'succeeded', $3, $4, NOW())`,
      [
        userId,
        amountUsd,
        reference,
        JSON.stringify({ provider: "stripe", sessionId: session.id, plan }),
      ],
    );

    return NextResponse.json({ ok: true, plan });
  }

  // Crédits IA (legacy: metadata sans checkoutKind = crédits)
  const userId = session.metadata?.userId;
  const amountUsdCentsRaw = session.metadata?.amountUsdCents;
  const creditsRaw = session.metadata?.credits;
  const amountUsdCents = amountUsdCentsRaw ? Number(amountUsdCentsRaw) : NaN;
  const creditsFromMetadata = creditsRaw ? Number(creditsRaw) : NaN;

  if (!userId || !Number.isFinite(amountUsdCents)) {
    return NextResponse.json({ error: "Metadata manquante." }, { status: 400 });
  }

  const credits = Number.isFinite(creditsFromMetadata) ? creditsFromMetadata : creditsFromUsdCents(amountUsdCents);
  const reference = `stripe:checkout_session:${session.id}`;

  const existing = await pool.query(
    `SELECT id FROM ${SQL_TABLES.billingEvents} WHERE reference = $1 LIMIT 1`,
    [reference],
  );
  if (existing.rows.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const amountUsd = amountUsdCents / 100;

  const updateRes = await pool.query(
    `UPDATE ${SQL_TABLES.user}
     SET "aiCreditsBalance" = "aiCreditsBalance" + $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING "aiCreditsBalance"`,
    [userId, credits],
  );

  await pool.query(
    `INSERT INTO ${SQL_TABLES.billingEvents} (id, "userId", type, credits, "amountEur", status, reference, metadata, "createdAt")
     VALUES (gen_random_uuid(), $1, 'topup', $2, $3, 'succeeded', $4, $5, NOW())`,
    [
      userId,
      credits,
      amountUsd,
      reference,
      JSON.stringify({ provider: "stripe", sessionId: session.id, amountUsdCents }),
    ],
  );

  return NextResponse.json({ ok: true, balance: Number(updateRes.rows[0]?.aiCreditsBalance ?? 0) });
}
