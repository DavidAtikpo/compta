import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { stripe } from "@/lib/stripe";

const MIN_AMOUNT_USD_CENTS = 500; // $5.00

function creditsFromUsdCents(usdCents: number): number {
  // $5 => 2500 credits -> 1 cent => 5 credits
  return usdCents * 5;
}

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amountUsd = Number(body?.amountUsd);
  if (!Number.isFinite(amountUsd)) {
    return NextResponse.json({ error: "amountUsd invalide." }, { status: 400 });
  }

  const amountUsdCents = Math.round(amountUsd * 100);
  if (amountUsdCents < MIN_AMOUNT_USD_CENTS) {
    return NextResponse.json({ error: "Minimum 5$." }, { status: 400 });
  }

  const credits = creditsFromUsdCents(amountUsdCents);

  const origin = request.headers.get("origin") || "http://localhost:3000";
  const successUrl = `${origin}/settings?tab=overview&purchase=success`;
  const cancelUrl = `${origin}/settings?tab=overview&purchase=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountUsdCents,
          product_data: {
            name: "Crédits Compta IA",
            description: `${credits.toLocaleString("fr-FR")} crédits`,
          },
        },
      },
    ],
    metadata: {
      checkoutKind: "credits",
      userId,
      credits: String(credits),
      amountUsdCents: String(amountUsdCents),
    },
  });

  return NextResponse.json({ url: session.url });
}

