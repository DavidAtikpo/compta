/** Pays en tête de toutes les listes (ordre fixe). */
export const PRIORITY_REGION_VALUES = ["togo", "france", "bulgarie"] as const;

/** Anciens libellés (rétrocompatibilité affichage). */
export const regionOptions = [
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "bulgarie", label: "Bulgarie", flag: "🇧🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
];

export const IMAP_COUNTRY_GROUPS: { groupName: string; options: { value: string; label: string }[] }[] = [
  {
    groupName: "Europe",
    options: [
      { value: "france", label: "🇫🇷 France" },
      { value: "bulgarie", label: "🇧🇬 Bulgarie" },
      { value: "belgique", label: "🇧🇪 Belgique" },
      { value: "suisse", label: "🇨🇭 Suisse" },
      { value: "luxembourg", label: "🇱🇺 Luxembourg" },
      { value: "allemagne", label: "🇩🇪 Allemagne" },
      { value: "espagne", label: "🇪🇸 Espagne" },
      { value: "italie", label: "🇮🇹 Italie" },
      { value: "portugal", label: "🇵🇹 Portugal" },
      { value: "pays_bas", label: "🇳🇱 Pays-Bas" },
      { value: "autriche", label: "🇦🇹 Autriche" },
      { value: "pologne", label: "🇵🇱 Pologne" },
      { value: "roumanie", label: "🇷🇴 Roumanie" },
      { value: "grece", label: "🇬🇷 Grèce" },
      { value: "irlande", label: "🇮🇪 Irlande" },
      { value: "royaume_uni", label: "🇬🇧 Royaume-Uni" },
      { value: "suede", label: "🇸🇪 Suède" },
      { value: "norvege", label: "🇳🇴 Norvège" },
      { value: "danemark", label: "🇩🇰 Danemark" },
      { value: "finlande", label: "🇫🇮 Finlande" },
      { value: "republique_tcheque", label: "🇨🇿 République tchèque" },
      { value: "hongrie", label: "🇭🇺 Hongrie" },
      { value: "croatie", label: "🇭🇷 Croatie" },
    ],
  },
  {
    groupName: "Afrique",
    options: [
      { value: "maroc", label: "🇲🇦 Maroc" },
      { value: "algerie", label: "🇩🇿 Algérie" },
      { value: "tunisie", label: "🇹🇳 Tunisie" },
      { value: "senegal", label: "🇸🇳 Sénégal" },
      { value: "cote_ivoire", label: "🇨🇮 Côte d'Ivoire" },
      { value: "cameroun", label: "🇨🇲 Cameroun" },
      { value: "togo", label: "🇹🇬 Togo" },
      { value: "benin", label: "🇧🇯 Bénin" },
      { value: "mali", label: "🇲🇱 Mali" },
      { value: "burkina", label: "🇧🇫 Burkina Faso" },
      { value: "nigeria", label: "🇳🇬 Nigeria" },
      { value: "kenya", label: "🇰🇪 Kenya" },
      { value: "afrique_sud", label: "🇿🇦 Afrique du Sud" },
      { value: "egypte", label: "🇪🇬 Égypte" },
    ],
  },
  {
    groupName: "Amériques",
    options: [
      { value: "canada", label: "🇨🇦 Canada" },
      { value: "usa", label: "🇺🇸 États-Unis" },
      { value: "mexique", label: "🇲🇽 Mexique" },
      { value: "bresil", label: "🇧🇷 Brésil" },
      { value: "argentine", label: "🇦🇷 Argentine" },
      { value: "chili", label: "🇨🇱 Chili" },
      { value: "colombie", label: "🇨🇴 Colombie" },
      { value: "perou", label: "🇵🇪 Pérou" },
    ],
  },
  {
    groupName: "Asie & Océanie",
    options: [
      { value: "vietnam", label: "🇻🇳 Vietnam" },
      { value: "chine", label: "🇨🇳 Chine" },
      { value: "japon", label: "🇯🇵 Japon" },
      { value: "coree_sud", label: "🇰🇷 Corée du Sud" },
      { value: "inde", label: "🇮🇳 Inde" },
      { value: "singapour", label: "🇸🇬 Singapour" },
      { value: "thailande", label: "🇹🇭 Thaïlande" },
      { value: "indonesie", label: "🇮🇩 Indonésie" },
      { value: "philippines", label: "🇵🇭 Philippines" },
      { value: "australie", label: "🇦🇺 Australie" },
      { value: "nouvelle_zelande", label: "🇳🇿 Nouvelle-Zélande" },
    ],
  },
  {
    groupName: "Moyen-Orient",
    options: [
      { value: "emirats", label: "🇦🇪 Émirats arabes unis" },
      { value: "arabie_saoudite", label: "🇸🇦 Arabie saoudite" },
      { value: "israel", label: "🇮🇱 Israël" },
      { value: "turquie", label: "🇹🇷 Turquie" },
      { value: "qatar", label: "🇶🇦 Qatar" },
    ],
  },
  {
    groupName: "Autre",
    options: [{ value: "autre", label: "🌍 Autre / non listé" }],
  },
];

export const IMAP_REGION_OPTIONS_FLAT = IMAP_COUNTRY_GROUPS.flatMap((g) => g.options);

export function normalizeRegionKey(region: string): string {
  return String(region || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function regionsMatch(a: string, b: string): boolean {
  return normalizeRegionKey(a) === normalizeRegionKey(b);
}

function priorityRegionRank(value: string): number {
  const key = normalizeRegionKey(value);
  const idx = (PRIORITY_REGION_VALUES as readonly string[]).indexOf(key);
  return idx === -1 ? PRIORITY_REGION_VALUES.length : idx;
}

/** Tri alphabétique FR avec Togo, France et Bulgarie en premier. */
export function sortRegionOptions<T extends { value: string; label: string }>(options: T[]): T[] {
  return [...options].sort((a, b) => {
    const pa = priorityRegionRank(a.value);
    const pb = priorityRegionRank(b.value);
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
  });
}

export const IMAP_REGION_OPTIONS_SORTED = sortRegionOptions(IMAP_REGION_OPTIONS_FLAT);

export function regionDisplayLabel(regionValue: string): string {
  return (
    IMAP_REGION_OPTIONS_FLAT.find((o) => o.value === regionValue)?.label ??
    regionOptions.find((r) => r.value === regionValue)?.label ??
    regionValue
  );
}

export function imapCountryFilterMatch(query: string, label: string, value: string): boolean {
  const q = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!q) return true;
  const hay = `${label} ${value.replace(/_/g, " ")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return hay.includes(q);
}
