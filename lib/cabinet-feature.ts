function parseCabinetFeatureFlag(raw: string | undefined, defaultOn: boolean): boolean {
  const v = raw?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return defaultOn;
}

/**
 * Cabinet comptable / portail / envoi par email.
 * Activé par défaut ; mettre CABINET_FEATURE_ENABLED=false pour désactiver.
 */
export function isCabinetFeatureEnabled(): boolean {
  return parseCabinetFeatureFlag(process.env.CABINET_FEATURE_ENABLED, true);
}

/** Côté client (NEXT_PUBLIC_CABINET_FEATURE_ENABLED ou variable serveur injectée au build). */
export function isCabinetFeatureEnabledClient(): boolean {
  return parseCabinetFeatureFlag(
    process.env.NEXT_PUBLIC_CABINET_FEATURE_ENABLED ?? process.env.CABINET_FEATURE_ENABLED,
    true,
  );
}

export const CABINET_FEATURE_DISABLED_MESSAGE =
  "La fonctionnalité cabinet comptable est désactivée sur cette application.";
