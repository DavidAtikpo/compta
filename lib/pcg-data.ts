/** Comptes PCG courants (classes 1 à 7) — base consultable et searchable */
import { PCG_EXTENDED } from "./pcg-extended";

export type PcgAccountSeed = {
  num: string;
  label: string;
  pcgClass: number;
  parentNum?: string;
};

export const INVOICE_CATEGORIES = [
  "Fournitures bureau",
  "Déplacement / Transport",
  "Repas professionnel",
  "Informatique / Logiciel",
  "Téléphone / Internet",
  "Loyer / Bureau",
  "Formation",
  "Publicité / Marketing",
  "Assurance",
  "Honoraires / Sous-traitance",
  "Matériel / Équipement",
  "Autre",
] as const;

export type InvoiceCategory = (typeof INVOICE_CATEGORIES)[number];

/** Mapping catégorie facture → compte PCG (FEC / écritures) */
export const CATEGORY_TO_ACCOUNT: Record<string, { num: string; label: string }> = {
  "Fournitures bureau": { num: "606400", label: "Fournitures administratives" },
  "Déplacement / Transport": { num: "625100", label: "Voyages et déplacements" },
  "Repas professionnel": { num: "625700", label: "Réceptions" },
  "Informatique / Logiciel": { num: "605000", label: "Achats de matériel, équipements et travaux" },
  "Téléphone / Internet": { num: "626000", label: "Frais postaux et de télécommunications" },
  "Loyer / Bureau": { num: "613200", label: "Locations immobilières" },
  Formation: { num: "618100", label: "Documentation générale" },
  "Publicité / Marketing": { num: "623000", label: "Publicité, publications, relations publiques" },
  Assurance: { num: "616000", label: "Primes d'assurances" },
  "Honoraires / Sous-traitance": { num: "622600", label: "Honoraires" },
  "Matériel / Équipement": { num: "215000", label: "Matériel et outillage" },
  Autre: { num: "607000", label: "Achats de marchandises" },
};

export const PCG_ACCOUNTS: PcgAccountSeed[] = [
  // Classe 1 — Comptes de capitaux
  { num: "101000", label: "Capital", pcgClass: 1 },
  { num: "106000", label: "Réserves", pcgClass: 1 },
  { num: "110000", label: "Report à nouveau (solde créditeur)", pcgClass: 1 },
  { num: "119000", label: "Report à nouveau (solde débiteur)", pcgClass: 1 },
  { num: "120000", label: "Résultat de l'exercice (bénéfice)", pcgClass: 1 },
  { num: "129000", label: "Résultat de l'exercice (perte)", pcgClass: 1 },
  { num: "164000", label: "Emprunts bancaires", pcgClass: 1 },
  { num: "168800", label: "Autres emprunts et dettes", pcgClass: 1 },

  // Classe 2 — Comptes d'immobilisations
  { num: "205000", label: "Concessions, brevets, licences", pcgClass: 2 },
  { num: "206000", label: "Droit au bail", pcgClass: 2 },
  { num: "213000", label: "Constructions", pcgClass: 2 },
  { num: "215000", label: "Matériel et outillage", pcgClass: 2 },
  { num: "218100", label: "Installations générales", pcgClass: 2 },
  { num: "218300", label: "Matériel de bureau et informatique", pcgClass: 2 },
  { num: "218400", label: "Mobilier", pcgClass: 2 },
  { num: "281000", label: "Amortissements des immobilisations incorporelles", pcgClass: 2 },
  { num: "281300", label: "Amortissements des constructions", pcgClass: 2 },
  { num: "281500", label: "Amortissements du matériel", pcgClass: 2 },
  { num: "281830", label: "Amortissements matériel de bureau", pcgClass: 2 },

  // Classe 3 — Stocks
  { num: "310000", label: "Stocks de matières premières", pcgClass: 3 },
  { num: "355000", label: "Stocks de produits", pcgClass: 3 },
  { num: "370000", label: "Stocks de marchandises", pcgClass: 3 },
  { num: "391000", label: "Dépréciations des stocks", pcgClass: 3 },

  // Classe 4 — Comptes de tiers
  { num: "401000", label: "Fournisseurs", pcgClass: 4 },
  { num: "411000", label: "Clients", pcgClass: 4 },
  { num: "421000", label: "Personnel — Rémunérations dues", pcgClass: 4 },
  { num: "431000", label: "Sécurité sociale", pcgClass: 4 },
  { num: "437000", label: "Autres organismes sociaux", pcgClass: 4 },
  { num: "444000", label: "État — Impôts sur les bénéfices", pcgClass: 4 },
  { num: "445510", label: "TVA à décaisser", pcgClass: 4 },
  { num: "445660", label: "TVA déductible sur biens et services", pcgClass: 4 },
  { num: "445710", label: "TVA collectée", pcgClass: 4 },
  { num: "445800", label: "Taxes sur le chiffre d'affaires à régulariser", pcgClass: 4 },
  { num: "467000", label: "Autres comptes débiteurs ou créditeurs", pcgClass: 4 },
  { num: "512000", label: "Banque", pcgClass: 4 },
  { num: "531000", label: "Caisse", pcgClass: 4 },

  // Classe 5 — Comptes financiers (doublon banque/caisse regroupés en 512/531 ci-dessus)

  // Classe 6 — Charges
  { num: "601000", label: "Achats stockés — Matières premières", pcgClass: 6 },
  { num: "602000", label: "Achats stockés — Autres approvisionnements", pcgClass: 6 },
  { num: "604000", label: "Achats d'études et prestations de services", pcgClass: 6 },
  { num: "605000", label: "Achats de matériel, équipements et travaux", pcgClass: 6 },
  { num: "606000", label: "Achats non stockés de matière et fournitures", pcgClass: 6 },
  { num: "606100", label: "Fournitures non stockables (eau, énergie)", pcgClass: 6, parentNum: "606000" },
  { num: "606300", label: "Fournitures d'entretien et petit équipement", pcgClass: 6, parentNum: "606000" },
  { num: "606400", label: "Fournitures administratives", pcgClass: 6, parentNum: "606000" },
  { num: "607000", label: "Achats de marchandises", pcgClass: 6 },
  { num: "611000", label: "Sous-traitance générale", pcgClass: 6 },
  { num: "613000", label: "Locations", pcgClass: 6 },
  { num: "613200", label: "Locations immobilières", pcgClass: 6, parentNum: "613000" },
  { num: "613500", label: "Locations mobilières", pcgClass: 6, parentNum: "613000" },
  { num: "615000", label: "Entretien et réparations", pcgClass: 6 },
  { num: "616000", label: "Primes d'assurances", pcgClass: 6 },
  { num: "618100", label: "Documentation générale", pcgClass: 6 },
  { num: "622000", label: "Rémunérations d'intermédiaires et honoraires", pcgClass: 6 },
  { num: "622600", label: "Honoraires", pcgClass: 6, parentNum: "622000" },
  { num: "623000", label: "Publicité, publications, relations publiques", pcgClass: 6 },
  { num: "625000", label: "Déplacements, missions et réceptions", pcgClass: 6 },
  { num: "625100", label: "Voyages et déplacements", pcgClass: 6, parentNum: "625000" },
  { num: "625600", label: "Missions", pcgClass: 6, parentNum: "625000" },
  { num: "625700", label: "Réceptions", pcgClass: 6, parentNum: "625000" },
  { num: "626000", label: "Frais postaux et de télécommunications", pcgClass: 6 },
  { num: "627000", label: "Services bancaires et assimilés", pcgClass: 6 },
  { num: "628000", label: "Divers", pcgClass: 6 },
  { num: "631000", label: "Impôts, taxes et versements assimilés", pcgClass: 6 },
  { num: "633000", label: "Impôts, taxes et versements assimilés sur rémunérations", pcgClass: 6 },
  { num: "641000", label: "Rémunérations du personnel", pcgClass: 6 },
  { num: "645000", label: "Charges de sécurité sociale et de prévoyance", pcgClass: 6 },
  { num: "651000", label: "Redevances pour concessions, brevets, licences", pcgClass: 6 },
  { num: "658000", label: "Charges diverses de gestion courante", pcgClass: 6 },
  { num: "661000", label: "Charges d'intérêts", pcgClass: 6 },
  { num: "671000", label: "Charges exceptionnelles sur opérations de gestion", pcgClass: 6 },
  { num: "681000", label: "Dotations aux amortissements", pcgClass: 6 },
  { num: "695000", label: "Impôts sur les bénéfices", pcgClass: 6 },

  // Classe 7 — Produits
  { num: "701000", label: "Ventes de produits finis", pcgClass: 7 },
  { num: "706000", label: "Prestations de services", pcgClass: 7 },
  { num: "707000", label: "Ventes de marchandises", pcgClass: 7 },
  { num: "708000", label: "Produits des activités annexes", pcgClass: 7 },
  { num: "740000", label: "Subventions d'exploitation", pcgClass: 7 },
  { num: "758000", label: "Produits divers de gestion courante", pcgClass: 7 },
  { num: "761000", label: "Produits de participations", pcgClass: 7 },
  { num: "764000", label: "Revenus des valeurs mobilières de placement", pcgClass: 7 },
  { num: "771000", label: "Produits exceptionnels sur opérations de gestion", pcgClass: 7 },
  { num: "775000", label: "Produits des cessions d'éléments d'actif", pcgClass: 7 },
];

/** Plan complet = base + extension (sous-comptes courants) */
export const ALL_PCG_ACCOUNTS: PcgAccountSeed[] = [...PCG_ACCOUNTS, ...PCG_EXTENDED];
