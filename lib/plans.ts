export const PLANS = {
  starter: "starter",
  pro: "pro",
  entreprise: "entreprise",
} as const;

export type BillingPlanId = (typeof PLANS)[keyof typeof PLANS];

/**
 * Libellés UI pour le mode multi-utilisateurs (identifiant technique `entreprise` en base / Stripe).
 * Évite le mot « Entreprise » dans les menus — l’activation se reflète surtout dans le profil (en-tête).
 */
export const TEAM_MODE_UI = {
  navLabel: "Espace équipe",
  navShort: "Équipe",
  sectionTitle: "Espace équipe",
  sectionSubtitle: "Compte partagé, invitations et analyses pour votre organisation.",
  planDisplayName: "Plan Équipe",
  /** Brouillon créé après souscription (renommable par l’utilisateur). */
  workspaceDraftName: "Mon espace équipe",
  /** Page invitation (rejoindre un compte partagé). */
  joinInviteTitle: "Rejoindre l’espace équipe",
} as const;

export function normalizePlan(plan: string | null | undefined): BillingPlanId {
  const p = (plan || "starter").toLowerCase().trim();
  if (p === PLANS.pro) return PLANS.pro;
  // Alias anglais / legacy en base
  if (p === PLANS.entreprise || p === "enterprise" || p === "team") return PLANS.entreprise;
  return PLANS.starter;
}

export function isEntreprisePlan(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === PLANS.entreprise;
}

/** Nom du plan affiché dans l’interface (facturation / profil). */
export function billingPlanDisplayName(plan: string | null | undefined): string {
  const p = normalizePlan(plan);
  if (p === PLANS.entreprise) return TEAM_MODE_UI.planDisplayName;
  if (p === PLANS.pro) return "Pro";
  return "Starter";
}

/** Prix par défaut (centimes USD) si variables d'environnement absentes */
export function defaultPlanPriceUsdCents(plan: "pro" | "entreprise"): number {
  return plan === "entreprise" ? 9900 : 2900;
}
