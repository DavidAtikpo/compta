/**
 * Cabinet comptable / portail / envoi par email.
 * Désactivé par défaut ; mettre CABINET_FEATURE_ENABLED=true dans .env pour réactiver.
 */
export function isCabinetFeatureEnabled(): boolean {
  const v = process.env.CABINET_FEATURE_ENABLED?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  return false;
}

export const CABINET_FEATURE_DISABLED_MESSAGE =
  "La fonctionnalité cabinet comptable est désactivée sur cette application.";
