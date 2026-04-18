import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cache for 1 hour to avoid hammering the API
let cache: { data: TaxRules; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

interface TaxRules {
  source: string;
  year: number;
  lastUpdated: string;
  ir: IRBracket[];
  tva: TVARate[];
  cotisations: CotisationsData;
  plafonds: Plafonds;
  seuils: Seuils;
  dispositifs: Dispositif[];
  legalNotices: string[];
}

interface IRBracket {
  min: number;
  max: number | null;
  rate: number;
  label: string;
}

interface TVARate {
  rate: number;
  label: string;
  examples: string[];
}

interface CotisationsData {
  tns: CotisationLine[];
  autoEntrepreneur: CotisationLine[];
}

interface CotisationLine {
  label: string;
  rate: number;
  note?: string;
}

interface Plafonds {
  per_max: number;
  per_pct: number;
  micro_bic_ventes: number;
  micro_bic_services: number;
  micro_bnc: number;
  fcpi_fip_seul: number;
  fcpi_fip_couple: number;
  deficit_foncier: number;
  cadeaux_clients: number;
  franchise_tva_services: number;
  franchise_tva_ventes: number;
}

interface Seuils {
  is_taux_reduit_max: number;
  is_taux_reduit: number;
  is_taux_normal: number;
  abattement_micro_bic_ventes: number;
  abattement_micro_bic_services: number;
  abattement_micro_bnc: number;
}

interface Dispositif {
  nom: string;
  description: string;
  avantage: string;
  conditions: string;
  plafond?: string;
  lienLoi?: string;
}

async function fetchFromFranceAPI(): Promise<Partial<TaxRules> | null> {
  const apiKey = process.env.FRANCE_API_KEY;
  if (!apiKey) return null;

  try {
    // AIFE unireso (accès souvent limité ; la plupart des déploiements n’ont pas de clé → données statiques uniquement)
    const response = await fetch(
      "https://api.aife.economie.gouv.fr/unireso/1.0/api/annuaire",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (response.ok) {
      const data = await response.json();
      return { source: "AIFE api.gouv.fr", ...data };
    }
  } catch {
    // API not reachable, use static data
  }
  return null;
}

function getStaticFrenchTaxRules(): TaxRules {
  const year = new Date().getFullYear();
  return {
    source: "Données fiscales statiques France (Loi de finances 2024/2025)",
    year,
    lastUpdated: "2025-01-01",
    ir: [
      { min: 0, max: 11294, rate: 0, label: "Tranche 0%" },
      { min: 11295, max: 28797, rate: 11, label: "Tranche 11%" },
      { min: 28798, max: 82341, rate: 30, label: "Tranche 30%" },
      { min: 82342, max: 177106, rate: 41, label: "Tranche 41%" },
      { min: 177107, max: null, rate: 45, label: "Tranche 45%" },
    ],
    tva: [
      {
        rate: 20,
        label: "Taux normal",
        examples: ["Biens courants", "Services courants", "Vêtements"],
      },
      {
        rate: 10,
        label: "Taux intermédiaire",
        examples: ["Restauration", "Travaux de rénovation", "Transport de voyageurs"],
      },
      {
        rate: 5.5,
        label: "Taux réduit",
        examples: ["Produits alimentaires", "Livres", "Abonnements gaz/électricité"],
      },
      {
        rate: 2.1,
        label: "Taux super-réduit",
        examples: ["Médicaments remboursables", "Presse quotidienne", "Spectacles vivants premiers billets"],
      },
    ],
    cotisations: {
      tns: [
        { label: "Maladie", rate: 6.5, note: "Revenu < 46 368 €: taux réduit" },
        { label: "Retraite de base", rate: 17.75 },
        { label: "Retraite complémentaire", rate: 7.0 },
        { label: "Invalidité-décès", rate: 1.3 },
        { label: "Allocations familiales", rate: 3.1, note: "0% si revenus < 51 005 €" },
        { label: "CSG/CRDS", rate: 9.7 },
        { label: "Formation professionnelle", rate: 0.25 },
      ],
      autoEntrepreneur: [
        { label: "BIC vente de marchandises", rate: 12.3 },
        { label: "BIC prestation de services", rate: 21.2 },
        { label: "BNC profession libérale", rate: 21.1 },
        { label: "Avec versement libératoire BIC ventes", rate: 13.1 },
        { label: "Avec versement libératoire BIC services", rate: 22.9 },
        { label: "Avec versement libératoire BNC", rate: 23.2 },
      ],
    },
    plafonds: {
      per_max: 35194,
      per_pct: 10,
      micro_bic_ventes: 188700,
      micro_bic_services: 77700,
      micro_bnc: 77700,
      fcpi_fip_seul: 12000,
      fcpi_fip_couple: 24000,
      deficit_foncier: 10700,
      cadeaux_clients: 73,
      franchise_tva_services: 36800,
      franchise_tva_ventes: 91900,
    },
    seuils: {
      is_taux_reduit_max: 42500,
      is_taux_reduit: 15,
      is_taux_normal: 25,
      abattement_micro_bic_ventes: 71,
      abattement_micro_bic_services: 50,
      abattement_micro_bnc: 34,
    },
    dispositifs: [
      {
        nom: "PER – Plan Épargne Retraite",
        description: "Épargne retraite avec déductibilité immédiate",
        avantage: `Déduction jusqu'à ${Math.round(35194)}€/an (10% du revenu net imposable)`,
        conditions: "Tout contribuable imposable",
        plafond: "35 194 € en 2024",
        lienLoi: "Art. 163 quatervicies CGI",
      },
      {
        nom: "CIR – Crédit Impôt Recherche",
        description: "Crédit d'impôt sur les dépenses de R&D",
        avantage: "30% des dépenses R&D jusqu'à 100 M€, 5% au-delà",
        conditions: "Entreprises réalisant des dépenses de R&D",
        lienLoi: "Art. 244 quater B CGI",
      },
      {
        nom: "JEI – Jeune Entreprise Innovante",
        description: "Exonérations pour startups innovantes",
        avantage: "Exonération IS 1ère année bénéficiaire + exonération cotisations patronales R&D",
        conditions: "< 8 ans, < 250 salariés, 15% dépenses R&D",
        lienLoi: "Art. 44 sexies-0 A CGI",
      },
      {
        nom: "FCPI/FIP – Fonds d'investissement",
        description: "Réduction IR par investissement dans PME innovantes",
        avantage: "Réduction IR 18-25%",
        conditions: "Blocage 5 ans minimum",
        plafond: "12 000 €/pers, 24 000 €/couple",
        lienLoi: "Art. 199 terdecies-0 A CGI",
      },
      {
        nom: "Déficit foncier",
        description: "Imputation des charges foncières sur revenu global",
        avantage: "Jusqu'à 10 700 €/an sur revenu global (21 400 € travaux éco-énergétiques jusqu'en 2025)",
        conditions: "Propriétaire d'un bien locatif non meublé",
        lienLoi: "Art. 156 CGI",
      },
      {
        nom: "Madelin – Contrats facultatifs TNS",
        description: "Déduction des cotisations prévoyance/retraite/mutuelle",
        avantage: "Déduction totale du résultat imposable",
        conditions: "TNS (BIC/BNC), cotisations dans la limite des plafonds Madelin",
        lienLoi: "Art. 154 bis CGI",
      },
      {
        nom: "Holding IS – Régime mère-fille",
        description: "Remontée de dividendes entre sociétés",
        avantage: "95% des dividendes exonérés d'IS (seulement 5% de quote-part de frais)",
        conditions: "Participation ≥ 5%, détenue depuis 2 ans minimum",
        lienLoi: "Art. 145 et 216 CGI",
      },
      {
        nom: "LMNP – Loueur Meublé Non Professionnel",
        description: "Amortissement comptable du bien immobilier",
        avantage: "Revenus locatifs non imposables grâce aux amortissements (bien + mobilier)",
        conditions: "Location meublée, recettes < 23 000 € ou < 50% revenus totaux",
        lienLoi: "Art. 39 C CGI et Art. 151 septies CGI",
      },
    ],
    legalNotices: [
      "Ces informations sont à titre indicatif. Consultez un expert-comptable pour votre situation spécifique.",
      "La législation fiscale évolue chaque année avec la Loi de Finances.",
      "Tout montage fiscal doit avoir une substance économique réelle (Art. L64 LPF – abus de droit).",
      "Sources : BOFIP (bofip.impots.gouv.fr), CGI, CSS, Loi de finances 2024/2025.",
    ],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  if (cache && !forceRefresh && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, fromCache: true });
  }

  const apiData = await fetchFromFranceAPI();
  const staticData = getStaticFrenchTaxRules();

  const merged: TaxRules = apiData
    ? { ...staticData, ...apiData, source: `${staticData.source} + ${apiData.source}` }
    : staticData;

  cache = { data: merged, timestamp: Date.now() };

  return NextResponse.json(merged);
}
