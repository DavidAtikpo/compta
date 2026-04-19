"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IMAP_REGION_OPTIONS_SORTED,
  imapCountryFilterMatch,
  regionDisplayLabel,
} from "@/lib/country-regions";

const businessTypes = [
  { value: "auto-entrepreneur", label: "Auto-entrepreneur / Micro" },
  { value: "eurl", label: "EURL / SASU" },
  { value: "sarl", label: "SARL" },
  { value: "sas", label: "SAS" },
  { value: "sci", label: "SCI (Immobilier)" },
  { value: "association", label: "Association loi 1901" },
  { value: "profession-liberale", label: "Profession libérale BNC" },
  { value: "holding", label: "Holding IS" },
  { value: "salarie", label: "Salarié / Particulier" },
];

const quickPrompts = [
  {
    title: "Optimisation globale",
    prompt: "Analyse ma situation complète et donne-moi TOUTES les optimisations fiscales possibles pour réduire au maximum mes impôts légalement. Inclus les dispositifs, déductions, crédits d'impôt et stratégies d'optimisation disponibles.",
  },
  {
    title: "TVA & Charges",
    prompt: "Optimise ma TVA récupérable et mes charges déductibles. Quelles dépenses puis-je déduire à 100%, lesquelles partiellement ? Comment récupérer un maximum de TVA sur mes achats professionnels ?",
  },
  {
    title: "PER & Épargne retraite",
    prompt: "Explique-moi comment maximiser les déductions via le PER (Plan Épargne Retraite) et les contrats Madelin. Quel montant optimal dois-je verser pour réduire au maximum mon IR cette année ?",
  },
  {
    title: "Rémunération dirigeant",
    prompt: "Quelle est la structure de rémunération optimale pour un dirigeant : salaire vs dividendes ? Calcule la charge fiscale et sociale dans chaque cas et recommande la meilleure stratégie.",
  },
  {
    title: "Immobilier & déficit",
    prompt: "Comment utiliser le déficit foncier, le LMNP et les dispositifs immobiliers (Denormandie, Malraux) pour réduire mes impôts ? Explique les plafonds et conditions.",
  },
  {
    title: "CIR & JEI",
    prompt: "Suis-je éligible au Crédit Impôt Recherche (CIR) ou au statut JEI (Jeune Entreprise Innovante) ? Quelles dépenses qualifient ? Quel montant puis-je récupérer ?",
  },
  {
    title: "International (Togo/Vietnam)",
    prompt: "Comment optimiser la fiscalité pour une activité internationale France-Togo-Vietnam ? Conventions fiscales, prix de transfert, TVA intracommunautaire, risques de double imposition.",
  },
  {
    title: "Holding & optimisation IS",
    prompt: "Comment structurer une holding pour optimiser l'impôt sur les sociétés ? Régime mère-fille, intégration fiscale, remontée de dividendes, apport-cession.",
  },
];

interface TaxRule {
  nom: string;
  description?: string;
  avantage: string;
  conditions: string;
  plafond?: string;
  lienLoi?: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface LegalAlert {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string | null;
  pubDate: string;
  seen: boolean;
}

export default function OptimizePage() {
  const [region, setRegion] = useState("france");
  const [optimizeCountryFilter, setOptimizeCountryFilter] = useState("");
  const [showOptimizeCountryList, setShowOptimizeCountryList] = useState(false);
  const [businessType, setBusinessType] = useState("eurl");
  const [prompt, setPrompt] = useState("");
  const [ocrContext, setOcrContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [legalAlerts, setLegalAlerts] = useState<LegalAlert[]>([]);
  const [alertsUnread, setAlertsUnread] = useState(0);
  const [showAlerts, setShowAlerts] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  /** Sur lg+ : un seul panneau gauche ouvert à la fois (Contexte ou Questions rapides). */
  const [desktopLeftPanel, setDesktopLeftPanel] = useState<"context" | "questions">("context");
  const alertsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTaxRules();
    loadAlerts();
  }, []);

  /** Fermer « Alertes loi » : clic / toucher hors panneau (desktop) + Échap. Sur mobile le fond assombri gère le tap. */
  useEffect(() => {
    if (!showAlerts) return;
    const closeIfOutside = (e: MouseEvent | TouchEvent) => {
      const root = alertsWrapRef.current;
      if (!root) return;
      const t = e.target;
      if (t instanceof Node && !root.contains(t)) setShowAlerts(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAlerts(false);
    };
    document.addEventListener("mousedown", closeIfOutside, true);
    document.addEventListener("touchstart", closeIfOutside, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", closeIfOutside, true);
      document.removeEventListener("touchstart", closeIfOutside, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [showAlerts]);

  const loadTaxRules = async () => {
    setLoadingRules(true);
    try {
      const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const res = await fetch("/api/tax-rules", {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTaxRules(data.dispositifs || []);
      }
    } catch { /* silent */ }
    finally { setLoadingRules(false); }
  };

  const loadAlerts = async (refresh = false) => {
    setLoadingAlerts(true);
    try {
      const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const url = refresh ? "/api/legifrance?refresh=1" : "/api/legifrance";
      const res = await fetch(url, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setLegalAlerts(data.alerts ?? []);
        setAlertsUnread((data.alerts ?? []).filter((a: LegalAlert) => !a.seen).length);
      }
    } catch { /* silent */ }
    finally { setLoadingAlerts(false); }
  };

  const markAlertSeen = async (id: string | "all") => {
    const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
    await fetch("/api/legifrance", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: JSON.stringify({ id }),
    });
    setLegalAlerts((prev) => prev.map((a) => id === "all" || a.id === id ? { ...a, seen: true } : a));
    setAlertsUnread(id === "all" ? 0 : Math.max(0, alertsUnread - 1));
  };

  const handleOptimize = async (customPrompt?: string) => {
    const finalPrompt = customPrompt || prompt;
    if (!finalPrompt.trim()) return;

    const userMsg: ConversationMessage = {
      role: "user",
      content: finalPrompt,
      timestamp: new Date(),
    };
    setConversation((prev) => [...prev, userMsg]);
    setPrompt("");
    setLoading(true);

    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          region,
          businessType,
          prompt: finalPrompt,
          ocrText: ocrContext || undefined,
        }),
      });
      const data = await res.json();
      const answer = data.answer || data.error || "Aucune réponse.";
      setConversation((prev) => [
        ...prev,
        { role: "assistant", content: answer, timestamp: new Date() },
      ]);
    } catch {
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erreur de connexion au service d'IA. Vérifiez votre clé OpenAI.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /** Gras inline **…**, italique *…*, astérisques orphelins et # en trop. */
  const renderInlineMarkdown = (s: string): ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, j) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) {
        return (
          <strong key={j} className="font-semibold text-slate-900">
            {bold[1]}
          </strong>
        );
      }
      let t = part.replace(/\*([^*]+)\*/g, "$1");
      t = t.replace(/\*\*/g, "");
      t = t.replace(/(^|\n)\s*#{1,6}\s*/g, "$1");
      return <span key={j}>{t}</span>;
    });
  };

  const formatAnswer = (text: string) => {
    return text.split("\n").map((line, i) => {
      const trimmed = line.trimEnd();
      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        const body = heading[2].replace(/^#+\s*/, "").trim();
        if (level <= 2) {
          return (
            <h3 key={i} className="mt-3 mb-1.5 text-sm font-bold text-slate-900 sm:mt-4 sm:mb-2 sm:text-base">
              {renderInlineMarkdown(body)}
            </h3>
          );
        }
        return (
          <h4 key={i} className="mt-2 mb-1 text-xs font-bold text-slate-800 sm:mt-3 sm:text-sm">
            {renderInlineMarkdown(body)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={i} className="mt-3 mb-1.5 text-sm font-bold text-slate-900 sm:mt-4 sm:mb-2 sm:text-base">
            {renderInlineMarkdown(trimmed.slice(3))}
          </h3>
        );
      }
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={i} className="mt-2 mb-1 text-xs font-bold text-slate-800 sm:mt-3 sm:text-sm">
            {renderInlineMarkdown(trimmed.slice(4))}
          </h4>
        );
      }
      if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
        return (
          <p key={i} className="mt-1.5 text-xs font-semibold text-slate-900 sm:mt-2 sm:text-sm">
            {renderInlineMarkdown(trimmed.slice(2, -2))}
          </p>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return (
          <li key={i} className="ml-3 list-disc text-xs leading-5 text-slate-700 sm:ml-4 sm:text-sm sm:leading-6">
            {renderInlineMarkdown(trimmed.slice(2))}
          </li>
        );
      }
      if (trimmed.match(/^\d+\./)) {
        return (
          <li key={i} className="ml-3 list-decimal text-xs leading-5 text-slate-700 sm:ml-4 sm:text-sm sm:leading-6">
            {renderInlineMarkdown(trimmed.replace(/^\d+\.\s*/, ""))}
          </li>
        );
      }
      if (trimmed === "") return <div key={i} className="h-1.5 sm:h-2" />;
      return (
        <p key={i} className="text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
          {renderInlineMarkdown(trimmed)}
        </p>
      );
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-6 lg:px-6 lg:py-6">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:min-h-0 lg:space-y-6">
        {/* Mobile : bandeau toujours visible (sticky) — Conseiller fiscal IA + Alertes. Desktop : titre complet + alertes. */}
        <div className="sticky top-0 z-30 -mx-3 flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:-mx-4 sm:px-4 lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:items-start lg:justify-between lg:gap-4 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <div className="min-w-0 flex-1 lg:flex-1">
            <h1 className="max-lg:truncate text-base font-bold tracking-tight text-slate-900 lg:text-2xl">
              <span className="lg:hidden">Conseiller fiscal IA</span>
              <span className="hidden lg:inline">Optimisation fiscale IA</span>
            </h1>
            <p className="mt-0.5 hidden text-[11px] leading-snug text-slate-500 sm:mt-1 sm:text-sm lg:block">
              IA spécialisée en fiscalité — barèmes et dispositifs ; alertes JO, data.gouv et Judilibre (PISTE) si configuré
            </p>
          </div>
          {conversation.length > 0 && (
            <button
              type="button"
              onClick={() => setConversation([])}
              className="shrink-0 text-[10px] font-medium text-slate-500 hover:text-slate-800 lg:hidden"
            >
              Effacer
            </button>
          )}
          {/* Alertes Légifrance */}
          <div ref={alertsWrapRef} className="relative shrink-0 self-center sm:self-auto lg:self-start">
            <button
              type="button"
              onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) loadAlerts(); }}
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <svg className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Alertes loi
              {alertsUnread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {alertsUnread}
                </span>
              )}
            </button>
            {showAlerts && (
              <>
                {/* Mobile / tablette : zone plein écran sous le panneau pour fermer au tap (le panneau est au-dessus, z-50) */}
                <button
                  type="button"
                  aria-label="Fermer les alertes"
                  className="fixed inset-0 z-[45] cursor-default touch-manipulation bg-slate-900/25 lg:hidden"
                  onClick={() => setShowAlerts(false)}
                />
                <div className="fixed inset-x-2 top-14 z-50 max-h-[min(75dvh,560px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-80 sm:rounded-2xl">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-2 sm:px-4 sm:py-3">
                  <h3 className="text-xs font-semibold text-slate-900 sm:text-sm">Alertes veille juridique</h3>
                  <div className="flex shrink-0 gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => loadAlerts(true)}
                      disabled={loadingAlerts}
                      className="text-[10px] text-blue-600 hover:text-blue-700 disabled:opacity-50 sm:text-xs"
                    >
                      {loadingAlerts ? "…" : "Actualiser"}
                    </button>
                    {alertsUnread > 0 && (
                      <button type="button" onClick={() => markAlertSeen("all")} className="text-[10px] text-slate-400 hover:text-slate-600 sm:text-xs">
                        Tout marquer lu
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-[min(60dvh,420px)] overflow-y-auto divide-y divide-slate-100 sm:max-h-80">
                  {legalAlerts.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      {loadingAlerts ? "Chargement…" : "Aucune alerte. Cliquez sur Actualiser."}
                    </p>
                  ) : (
                    legalAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`cursor-pointer px-2.5 py-2 transition hover:bg-slate-50 sm:px-4 sm:py-3 ${!alert.seen ? "bg-blue-50/50" : ""}`}
                        onClick={() => { markAlertSeen(alert.id); if (alert.url) window.open(alert.url, "_blank"); }}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className={`text-[11px] font-medium leading-snug sm:text-xs ${!alert.seen ? "text-slate-900" : "text-slate-600"}`}>
                            {!alert.seen && <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 align-middle" />}
                            {alert.title}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleOptimize(`Analyse cette mise à jour légale et son impact fiscal pour mon cas (${businessType}, ${region}) : "${alert.title}". ${alert.description}`); setShowAlerts(false); }}
                            className="shrink-0 whitespace-nowrap text-[10px] text-blue-600 hover:text-blue-700 sm:text-xs"
                          >
                            Analyser →
                          </button>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-400 sm:text-xs">{alert.description}</p>
                        <p className="mt-0.5 text-[9px] text-slate-300 sm:mt-1 sm:text-[10px]">
                          {new Date(alert.pubDate).toLocaleDateString("fr-FR")} — {alert.source}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              </>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-stretch lg:space-y-0">
          {/* Colonne gauche : contexte, prompts, dispositifs — masquée sur téléphone ; desktop : scroll interne (pas de scroll de la page) */}
          <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto sm:gap-6 lg:col-start-1 lg:row-start-1 lg:max-h-full lg:flex">
            {/* 1 — Contexte ; sur lg un seul panneau gauche ouvert à la fois avec Questions rapides */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:space-y-4 sm:rounded-2xl sm:p-5">
              <button
                type="button"
                onClick={() => setDesktopLeftPanel("context")}
                className="flex w-full items-center justify-between gap-2 rounded-lg text-left lg:-mx-1 lg:px-1 lg:py-0.5 lg:hover:bg-slate-50"
              >
                <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">Contexte</h2>
                <span className="hidden text-[10px] font-normal text-slate-400 lg:inline">
                  {desktopLeftPanel === "context" ? "▼" : "▶"}
                </span>
              </button>

              <div className={desktopLeftPanel !== "context" ? "space-y-3 sm:space-y-4 lg:hidden" : "space-y-3 sm:space-y-4"}>
                <div>
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:mb-2 sm:text-xs sm:normal-case sm:tracking-normal">
                  Pays / région fiscal
                </span>
                <button
                  type="button"
                  id="optimize-country-toggle"
                  aria-expanded={showOptimizeCountryList}
                  aria-haspopup="listbox"
                  onClick={() => setShowOptimizeCountryList((v) => !v)}
                  className="mb-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs"
                >
                  <span>{regionDisplayLabel(region)}</span>
                  <span className="shrink-0 text-slate-400" aria-hidden>{showOptimizeCountryList ? "▲" : "▼"}</span>
                </button>
                {showOptimizeCountryList && (
                  <>
                    <input
                      id="optimize-country-filter"
                      type="search"
                      value={optimizeCountryFilter}
                      onChange={(e) => setOptimizeCountryFilter(e.target.value)}
                      placeholder="Filtrer (ex. bel, sénégal…)"
                      autoComplete="off"
                      spellCheck={false}
                      className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs"
                    />
                    <ul
                      role="listbox"
                      aria-label="Pays"
                      className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 bg-white sm:max-h-36"
                    >
                      {IMAP_REGION_OPTIONS_SORTED.filter((o) =>
                        imapCountryFilterMatch(optimizeCountryFilter, o.label, o.value),
                      ).map((o) => (
                        <li key={o.value} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={region === o.value}
                            onClick={() => {
                              setRegion(o.value);
                              setOptimizeCountryFilter("");
                              setShowOptimizeCountryList(false);
                            }}
                            className={`flex w-full items-center px-2 py-1.5 text-left text-[11px] transition sm:px-2.5 sm:text-xs ${
                              region === o.value
                                ? "bg-slate-900 font-semibold text-white"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {o.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {IMAP_REGION_OPTIONS_SORTED.every(
                      (o) => !imapCountryFilterMatch(optimizeCountryFilter, o.label, o.value),
                    ) && (
                      <p className="mt-1 text-[10px] text-amber-700">Aucun pays ne correspond.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowOptimizeCountryList(false)}
                      className="mt-1.5 text-[10px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      Fermer la liste
                    </button>
                  </>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:mb-2 sm:text-xs sm:normal-case sm:tracking-normal">Type d&apos;entreprise / Situation</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                >
                  {businessTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:mb-2 sm:text-xs sm:normal-case sm:tracking-normal">
                  Contexte facture (texte collé)
                </label>
                <p className="mb-1.5 text-[10px] leading-snug text-slate-500 sm:mb-2 sm:text-xs sm:leading-relaxed">
                  Cette page ne lit pas votre fichier : vous collez ici le texte déjà obtenu (OCR sur une photo ou un PDF ailleurs, ou copier-coller depuis une facture). Ce bloc est envoyé au conseiller IA avec chaque question (montants, TVA, fournisseur…), tronqué côté serveur si très long. Laissez vide si vous n&apos;en avez pas besoin.
                </p>
                <textarea
                  value={ocrContext}
                  onChange={(e) => setOcrContext(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs"
                  placeholder="Ex. texte issu d'un outil OCR ou du PDF de la facture…"
                />
              </div>
              </div>
            </div>

            {/* 3 — Questions rapides + dispositifs (sous le chat sur mobile ; desktop : sous Contexte, mais ne prend pas de hauteur quand fermé) */}
            <div className="space-y-3 sm:space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5">
                <button
                  type="button"
                  onClick={() => setDesktopLeftPanel("questions")}
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg text-left sm:mb-3 lg:-mx-1 lg:px-1 lg:py-0.5 lg:hover:bg-slate-50"
                >
                  <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">Questions rapides</h2>
                  <span className="hidden text-[10px] font-normal text-slate-400 lg:inline">
                    {desktopLeftPanel === "questions" ? "▼" : "▶"}
                  </span>
                </button>
                <div className={desktopLeftPanel !== "questions" ? "lg:hidden" : ""}>
                  <p className="mb-2 text-[10px] leading-snug text-slate-500 sm:mb-3 sm:text-xs">
                    Raccourcis vers l&apos;IA (étape 2). Complétez d&apos;abord le contexte si besoin.
                  </p>
                  <div className="space-y-1.5 sm:space-y-2">
                    {quickPrompts.map((qp) => (
                      <button
                        type="button"
                        key={qp.title}
                        onClick={() => handleOptimize(qp.prompt)}
                        disabled={loading}
                        className="flex w-full items-center rounded-lg border border-slate-200 px-2 py-2 text-left text-[11px] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                      >
                        <span className="font-medium">{qp.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
                <button
                  type="button"
                  onClick={() => setShowRules(!showRules)}
                  className="flex w-full items-center justify-between px-3 py-3 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 sm:px-5 sm:py-4 sm:text-sm"
                >
                  <span>Dispositifs fiscaux 2024/2025</span>
                  <svg className={`h-3.5 w-3.5 shrink-0 transition-transform sm:h-4 sm:w-4 ${showRules ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showRules && (
                  <div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-100 px-3 pb-3 sm:max-h-96 sm:space-y-3 sm:px-5 sm:pb-5">
                    {loadingRules ? (
                      <p className="pt-2 text-[11px] text-slate-400 sm:pt-3 sm:text-xs">Chargement…</p>
                    ) : taxRules.length === 0 ? (
                      <p className="pt-2 text-[11px] text-slate-400 sm:pt-3 sm:text-xs">Aucun dispositif chargé.</p>
                    ) : (
                      taxRules.map((rule, i) => (
                        <div key={i} className="pt-2 sm:pt-3">
                          <p className="text-[11px] font-bold text-slate-900 sm:text-xs">{rule.nom}</p>
                          <p className="mt-0.5 text-[10px] text-slate-600 sm:text-xs">{rule.description}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-emerald-700 sm:text-xs">{rule.avantage}</p>
                          {rule.plafond && <p className="text-[10px] text-slate-400 sm:text-xs">Plafond : {rule.plafond}</p>}
                          <button
                            type="button"
                            onClick={() => handleOptimize(`Explique-moi en détail le dispositif "${rule.nom}" et comment l'optimiser pour mon cas (${businessType}, région ${region}).`)}
                            className="mt-1 text-[10px] text-blue-600 hover:text-blue-700 sm:mt-1.5 sm:text-xs"
                          >
                            Analyser pour mon cas →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Conseiller fiscal IA — sur mobile : occupe l’espace sous le bandeau (scroll interne au chat) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm max-lg:min-h-0 lg:col-start-2 lg:row-start-1 lg:h-full lg:min-h-0 lg:rounded-2xl">
            <div className="hidden items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-6 sm:py-4 lg:flex">
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-slate-900 sm:text-base">Conseiller fiscal IA</h2>
                <p className="text-[10px] text-slate-400 sm:text-xs">
                  Basé sur la Loi de Finances 2024/2025 — BOFIP — CGI — CSS
                </p>
              </div>
              {conversation.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConversation([])}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-slate-600 sm:text-xs"
                >
                  Effacer
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:space-y-6 sm:p-6">
              {conversation.length === 0 ? (
                <div className="flex min-h-[min(40dvh,320px)] flex-col items-center justify-center py-8 text-center sm:py-12">
                  <h3 className="mb-1.5 text-sm font-semibold text-slate-900 sm:mb-2 sm:text-lg">
                    Expert fiscal IA à votre service
                  </h3>
                  <p className="max-w-sm px-1 text-[11px] leading-snug text-slate-500 sm:text-sm">
                    Posez une question ou utilisez les prompts rapides pour obtenir un conseil fiscal personnalisé basé sur la législation française en vigueur.
                  </p>
                  <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-1.5 px-1 sm:mt-6 sm:gap-2">
                    {quickPrompts.slice(0, 4).map((qp) => (
                      <button
                        type="button"
                        key={qp.title}
                        onClick={() => handleOptimize(qp.prompt)}
                        disabled={loading}
                        className="flex w-full items-center rounded-lg border border-slate-200 px-2 py-2 text-left text-[10px] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                      >
                        <span className="font-medium leading-tight">{qp.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-xl px-3 py-2 sm:max-w-[80%] sm:rounded-2xl sm:px-4 sm:py-3 ${
                        msg.role === "user"
                          ? "bg-slate-900 text-xs text-white sm:text-sm"
                          : "border border-slate-200 bg-slate-50"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="leading-5 sm:leading-6">{msg.content}</p>
                      ) : (
                        <div className="space-y-0.5">{formatAnswer(msg.content)}</div>
                      )}
                      <p className={`mt-1.5 text-[10px] sm:mt-2 sm:text-xs ${msg.role === "user" ? "text-slate-400" : "text-slate-400"}`}>
                        {msg.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 sm:h-2 sm:w-2" style={{ animationDelay: "0ms" }} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 sm:h-2 sm:w-2" style={{ animationDelay: "150ms" }} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 sm:h-2 sm:w-2" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400 sm:text-xs">Analyse fiscale en cours…</p>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-2.5 sm:p-4">
              <div className="flex gap-2 sm:gap-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleOptimize();
                    }
                  }}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 focus:border-slate-400 focus:outline-none sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                  placeholder="Ex : Comment optimiser mes impôts en tant que gérant de SARL ?…"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => handleOptimize()}
                  disabled={loading || !prompt.trim()}
                  className="self-end shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  Envoyer
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 sm:mt-2 sm:text-xs">
                Entrée pour envoyer • Maj+Entrée pour nouvelle ligne • Données fiscales France 2024/2025
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
