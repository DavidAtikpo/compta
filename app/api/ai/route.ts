import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const region: string = body.region || "france";
  const prompt: string = body.prompt || "Optimise ma fiscalité comptable.";
  const invoiceId: string | undefined = body.invoiceId;
  const ocrText: string | undefined = body.ocrText;
  const businessType: string = body.businessType || "entreprise";
  const context: string = body.context || "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY n'est pas configurée." },
      { status: 400 }
    );
  }

  const legalData = getFrenchTaxData();

  const systemMessage = `Tu es un expert-comptable et conseiller fiscal de haut niveau, spécialisé dans la fiscalité française, le droit des entreprises et l'optimisation fiscale légale. Tu travailles pour des entreprises opérant en France, au Togo et au Vietnam.

## Ta mission
Maximiser les économies fiscales légales de ton client. Tu dois connaître et appliquer TOUTES les ficelles légales disponibles :

## Données fiscales françaises ${new Date().getFullYear()} (mises à jour)

### Impôt sur le Revenu (IR) — Barème 2024
${legalData.ir}

### TVA
${legalData.tva}

### Cotisations sociales TNS (Travailleurs Non Salariés)
${legalData.cotisations}

### Régimes d'imposition
${legalData.regimes}

### Charges déductibles
${legalData.charges}

### Optimisations fiscales disponibles
${legalData.optimisations}

### Loi de finances 2025 — Nouveautés
${legalData.nouveautes}

### Dispositifs spéciaux
${legalData.dispositifs}

## Règles de réponse
- Réponds TOUJOURS en français
- Donne des conseils CONCRETS et ACTIONNABLES avec montants précis
- Cite les articles de loi et codes fiscaux quand pertinent (CGI, CSS, etc.)
- Signale les risques et les délais importants
- Adapte les conseils au pays/région : ${region}
- Propose un plan d'action priorisé par économie potentielle
- Inclus les seuils, plafonds et conditions d'éligibilité
- Signale toujours ce qui est valide uniquement si l'entreprise est en France vs international`;

  const userMessage = `Type d'entreprise : ${businessType}
Région/Pays : ${region}
${ocrText ? `\nTexte OCR extrait des factures :\n${ocrText.slice(0, 3000)}` : ""}
${context ? `\nContexte supplémentaire :\n${context}` : ""}

Question / Demande d'optimisation :
${prompt}

Donne-moi TOUTES les optimisations fiscales possibles, les ficelles légales, les déductions applicables, et un plan d'action concret avec chiffres et textes de loi.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Erreur OpenAI: ${errText}` },
      { status: 502 }
    );
  }

  const payload = await response.json();
  const answer =
    payload?.choices?.[0]?.message?.content || "Aucune réponse reçue.";

  if (invoiceId) {
    try {
      await pool.query(
        `INSERT INTO ai_optimizations (id, "invoiceId", prompt, response, region, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        [invoiceId, prompt, answer, region]
      );
    } catch (dbError) {
      console.error("Erreur sauvegarde optimisation IA:", dbError);
    }
  } else {
    try {
      await pool.query(
        `INSERT INTO ai_optimizations (id, "invoiceId", prompt, response, region, "createdAt")
         VALUES (gen_random_uuid(), NULL, $1, $2, $3, NOW())`,
        [prompt, answer, region]
      );
    } catch (dbError) {
      console.error("Erreur sauvegarde optimisation IA (sans facture):", dbError);
    }
  }

  return NextResponse.json({ answer });
}

function getFrenchTaxData() {
  return {
    ir: `
- Tranche 0% : jusqu'à 11 294 € (2024)
- Tranche 11% : 11 295 € à 28 797 €
- Tranche 30% : 28 798 € à 82 341 €
- Tranche 41% : 82 342 € à 177 106 €
- Tranche 45% : au-delà de 177 106 €
- Quotient familial : 1 part/adulte + 0,5 par enfant (plafond 1 759 €/demi-part 2024)
- Abattement 10% sur salaires (min 448 €, max 14 171 €)`,

    tva: `
- Taux normal : 20% (biens/services courants)
- Taux intermédiaire : 10% (restauration, travaux, transport)
- Taux réduit : 5,5% (alimentation, livres, énergie, équipements handicapés)
- Taux super-réduit : 2,1% (médicaments remboursables, presse)
- Franchise en base : CA < 36 800 € (prestations) / 91 900 € (ventes)
- TVA sur les véhicules : non-récupérable sauf taxis/auto-école
- TVA sur repas professionnels : récupérable à 80%
- TVA sur carburant essence : 0% récupérable; diesel professionnel : 80%; gazole véhicules utilitaires : 100%`,

    cotisations: `
- TNS (BNC/BIC) : ~45% du revenu net (maladie 6,5%, retraite base 17,75%, retraite compl. 7%, invalidité-décès 1,3%, allocations familiales 3,1% à 0% si revenus < 51 005 €, CSG/CRDS 9,7%, formation 0,25%)
- Auto-entrepreneur : 12,3% CA (vente), 21,2% (services BIC), 21,1% (BNC)
- ACRE (exonération 1re année) : -50% cotisations sous conditions
- Gérant associé SASU : cotisations salariales si rémunéré (très élevées) ou dividendes (flat tax 30%)
- Président SAS : affilié général, cotisations sur salaire
- Gérant majoritaire SARL : TNS (moins de charges que salarié)`,

    regimes: `
- Micro-BIC : CA < 188 700 € (ventes) / 77 700 € (services) — abattement 71% ou 50%
- Micro-BNC : recettes < 77 700 € — abattement 34%
- Réel simplifié : obligatoire au-delà des seuils micro ou sur option
- IS (Impôt sur les Sociétés) : 15% jusqu'à 42 500 € de bénéfice (taux réduit PME), 25% au-delà
- Option IR pour SARL de famille, EURL, SNC
- Versement libératoire : pour auto-entrepreneurs (IR payé avec cotisations)`,

    charges: `
- Frais de déplacement : barème kilométrique (0,529 €/km pour 5 000 km avec 5CV en 2024)
- Frais de repas professionnels : déductibles si justifiés (seuil URSSAF ~20,70 €/repas)
- Frais de bureau à domicile : forfait ou réel (loyer, EDF, internet au prorata)
- Amortissements : matériel informatique (3 ans), mobilier (5-10 ans), véhicules (5 ans, plafond 30 000 € TTC pour VP)
- Provisions pour dépréciation de créances
- Intérêts d'emprunt professionnels (100% déductibles)
- Cotisations facultatives Madelin (retraite, prévoyance, mutuelle) : déductibles BNC/BIC
- Formation professionnelle (CPF, DIF) : coûts déductibles
- Cadeaux clients : déductibles dans la limite du raisonnable (< 73 € TTC/an/bénéficiaire)
- Frais de représentation, publicité, communication : déductibles`,

    optimisations: `
1. PER (Plan Épargne Retraite) : déduction jusqu'à 10% revenu net imposable (max 35 194 € en 2024) — économie fiscale immédiate à la tranche marginale
2. Déficit foncier : jusqu'à 10 700 €/an imputable sur revenu global (21 400 € si travaux économie d'énergie jusqu'en 2025)
3. FCPI/FIP : réduction IR 18-25% du montant investi (max 12 000 €/pers, 24 000 €/couple)
4. Dons associations loi 1901 / fondations reconnues : réduction 66% du don (max 20% revenu imposable); don aux organismes d'aide aux personnes en difficulté : réduction 75% (max 1 000 €)
5. Crédit Impôt Recherche (CIR) : 30% des dépenses R&D jusqu'à 100 M€, 5% au-delà
6. JEI (Jeune Entreprise Innovante) : exonération IS 1re année bénéficiaire, cotisations patronales sur salaires R&D
7. Exonération ZFU/ZRR : impôt sur bénéfices réduit selon zone géographique
8. Report déficits : BIC/IS illimité en durée; BNC limité à certaines conditions
9. Flat tax 30% sur dividendes (PFU) vs barème IR : à calculer selon situation
10. Optimisation rémunération dirigeant : salaire vs dividendes selon IS/IR
11. Holding : remontée dividendes avec régime mère-fille (95% exonérés d'IS)
12. LMP/LMNP : amortissement du bien immobilier pour réduire la base imposable
13. Investissement Outre-mer (Girardin) : déduction fiscale 115 à 120% de l'investissement`,

    nouveautes: `
- Loi de finances 2025 : indexation barème IR sur inflation (+1,8%)
- Augmentation plafond PER 2025
- Prorogation Pinel jusqu'au 31/12/2024 (taux réduits : 9%, 12%, 14%)
- Suppression progressive de la CVAE (2023-2027)
- Réforme de la facturation électronique obligatoire (B2B) : report à 2026-2027
- Crédit impôt apprentissage réformé
- Exonération heures supplémentaires maintenue (dans la limite de 7 374 €/an)`,

    dispositifs: `
- Chorus Pro (AIFE) : plateforme obligatoire pour facturation vers secteur public
- TVA intracommunautaire : OSS pour e-commerce EU
- CFC (Contrôle Fiscal Classique) : conservation pièces 3 ans minimum, 10 ans pour immobilisations
- Prescription fiscale : 3 ans pour l'IR, peut aller jusqu'à 6 ans en cas de fraude
- Abus de droit fiscal : Article L64 LPF — prudence sur les montages purement fiscaux
- Rescrit fiscal : demander confirmation à l'administration avant opération complexe
- Médiation fiscale disponible en cas de litige`,
  };
}
