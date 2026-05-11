export const PLANS = {
  starter: "starter",
  pro: "pro",
  entreprise: "entreprise",
} as const;

export type BillingPlanId = (typeof PLANS)[keyof typeof PLANS];

export function normalizePlan(plan: string | null | undefined): BillingPlanId {
  const p = (plan || "starter").toLowerCase().trim();
  if (p === PLANS.pro) return PLANS.pro;
  if (p === PLANS.entreprise) return PLANS.entreprise;
  return PLANS.starter;
}

export function isEntreprisePlan(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === PLANS.entreprise;
}

/** Prix par défaut (centimes USD) si variables d'environnement absentes */
export function defaultPlanPriceUsdCents(plan: "pro" | "entreprise"): number {
  return plan === "entreprise" ? 9900 : 2900;
}
