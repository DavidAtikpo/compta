import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { stripe } from "@/lib/stripe";
import { defaultPlanPriceUsdCents, TEAM_MODE_UI } from "@/lib/plans";

type PurchasablePlan = "pro" | "entreprise";
const ALLOWED: PurchasablePlan[] = ["pro", "entreprise"];

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = String(body?.plan || "").toLowerCase() as PurchasablePlan;
  if (!ALLOWED.includes(plan)) {
    return NextResponse.json({ error: "Plan invalide (pro ou entreprise)." }, { status: 400 });
  }

  const envKey = plan === "entreprise" ? "STRIPE_ENTREPRISE_PRICE_USD_CENTS" : "STRIPE_PRO_PRICE_USD_CENTS";
  const raw = process.env[envKey];
  const amountUsdCents = raw ? Number(raw) : defaultPlanPriceUsdCents(plan === "entreprise" ? "entreprise" : "pro");
  if (!Number.isFinite(amountUsdCents) || amountUsdCents < 50) {
    return NextResponse.json(
      { error: `Montant plan invalide. Définissez ${envKey} (centimes USD, min 50).` },
      { status: 500 },
    );
  }

  const origin = request.headers.get("origin") || "http://localhost:3000";
  const successUrl = `${origin}/settings?tab=overview&planPurchase=success`;
  const cancelUrl = `${origin}/settings?tab=overview&planPurchase=cancel`;

  const label =
    plan === "entreprise" ? `${TEAM_MODE_UI.planDisplayName} — Compta IA` : "Plan Pro — Compta IA";

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
            name: label,
            description:
              plan === "entreprise"
                ? `${TEAM_MODE_UI.planDisplayName} — compte partagé et analyses`
                : "Pro",
          },
        },
      },
    ],
    metadata: {
      checkoutKind: "plan",
      userId,
      plan,
      amountUsdCents: String(amountUsdCents),
    },
  });

  return NextResponse.json({ url: session.url });
}
