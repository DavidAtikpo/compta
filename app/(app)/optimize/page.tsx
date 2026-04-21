"use client";

import { useEffect, useState, type ReactNode } from "react";
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
    category: "International",
    title: "Meilleur pays dividendes",
    prompt: "Je veux créer une holding dans un pays où : 1) la retenue à la source (WHT) depuis la France est ≤ 5%, 2) l'impôt local sur les dividendes est ≤ 10%. Analyse TOUS les pays ayant une convention fiscale avec la France et donne-moi un classement des 10 meilleures destinations avec une table comparative complète (WHT, IS local, taux dividendes locaux, avantages, risques BEPS/substance, total charge fiscale, délai et coût de mise en place).",
  },
  {
    category: "International",
    title: "Bulgarie vs Île Maurice",
    prompt: "Compare en détail la Bulgarie et l'Île Maurice comme destinations pour une holding de remontée de dividendes depuis la France. Pour chaque pays : convention fiscale France (article et taux WHT), IS local, taux dividendes, exigences substance économique (BEPS), risques OCDE/liste grise, délai de création, coût annuel, avantages et inconvénients. Donne une recommandation finale chiffrée.",
  },
  {
    category: "International",
    title: "Cambodge - statut 2025",
    prompt: "Quel est le statut exact en 2025 de la négociation d'une convention fiscale entre la France et le Cambodge ? Y a-t-il eu un accord signé ou un vote à l'Assemblée nationale française ? Quelle est la retenue à la source actuelle sans convention ? À partir de quand pourrait-on légalement structurer vers le Cambodge ? Quels sont les risques actuels si on crée une structure là-bas maintenant ?",
  },
  {
    category: "International",
    title: "Maghreb & Afrique - conventions",
    prompt: "Analyse les conventions fiscales France avec les pays du Maghreb (Maroc, Tunisie, Algérie) et d'Afrique francophone (Sénégal, Côte d'Ivoire, Cameroun, Togo, Madagascar, Mauritanie). Pour chaque pays : taux WHT dividendes (article de convention), IS local, dividendes locaux, exigences, stabilité, recommandation. Quel est le meilleur pays d'Afrique pour une holding de remontée de dividendes depuis la France ?",
  },
  {
    category: "International",
    title: "Dubai & EAU - 0% total",
    prompt: "Comment structurer une holding aux Émirats Arabes Unis (Dubai Free Zone) pour bénéficier de 0% WHT et 0% IS ? Quelles sont les exigences de substance économique (UAE ESR) ? Quels sont les risques de requalification en France (article 123 bis CGI, prix de transfert) ? Quel type de Free Zone choisir : DMCC, DIFC, ADGM ? Coût et délai de mise en place réaliste.",
  },
  {
    category: "International",
    title: "Structure holding 3 niveaux",
    prompt: "Comment structurer une holding internationale en 3 niveaux pour optimiser la remontée de dividendes ? France (filiales opérationnelles) → Holding intermédiaire (Bulgarie ou Maurice) → Actionnaire. Détaille : capital minimum requis, délais, obligations comptables dans chaque pays, substance économique minimale, risques abus de droit article L64 LPF, coût annuel estimé de la structure, et économie fiscale annuelle estimée si dividendes = 500 000 €/an.",
  },
  {
    category: "France",
    title: "Optimisation globale",
    prompt: "Analyse ma situation complète et donne-moi TOUTES les optimisations fiscales possibles pour réduire au maximum mes impôts légalement. Inclus les dispositifs, déductions, crédits d'impôt et stratégies d'optimisation disponibles avec montants précis.",
  },
  {
    category: "France",
    title: "Salaire vs Dividendes",
    prompt: "Quelle est la structure de rémunération optimale pour un dirigeant : salaire vs dividendes ? Calcule la charge fiscale et sociale dans chaque cas (cotisations TNS, flat tax, IR). À partir de quel montant les dividendes sont-ils plus avantageux ?",
  },
  {
    category: "France",
    title: "Holding & régime mère-fille",
    prompt: "Comment structurer une holding pour optimiser l'impôt sur les sociétés ? Régime mère-fille (95% exonération), intégration fiscale, remontée de dividendes, apport-cession. Quelles sont les conditions et les économies potentielles ?",
  },
  {
    category: "France",
    title: "PER & Charges déductibles",
    prompt: "Comment maximiser les déductions via PER, Madelin et toutes les charges déductibles ? Quel montant optimal de PER pour réduire l'IR au maximum ? Quelles charges puis-je déduire à 100% vs partiellement ?",
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
  provider?: string;
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

interface AiHistoryItem {
  id: string;
  prompt: string;
  response: string;
  region: string;
  createdAt: string;
}

type AiProvider = "openai" | "claude" | "perplexity";

const AI_PROVIDERS: { id: AiProvider; label: string; color: string; desc: string }[] = [
  { id: "openai",     label: "ChatGPT",    color: "bg-emerald-600 text-white border-emerald-600",     desc: "GPT-4o" },
  { id: "claude",     label: "Claude",     color: "bg-orange-500 text-white border-orange-500",       desc: "Opus" },
  { id: "perplexity", label: "Perplexity", color: "bg-blue-600 text-white border-blue-600",           desc: "Sonar (web)" },
];

export default function OptimizePage() {
  const [region, setRegion] = useState("france");
  const [optimizeCountryFilter, setOptimizeCountryFilter] = useState("");
  const [showOptimizeCountryList, setShowOptimizeCountryList] = useState(false);
  const [businessType, setBusinessType] = useState("eurl");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
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
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [aiHistory, setAiHistory] = useState<AiHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Sur lg+ : un seul panneau gauche ouvert à la fois (Contexte ou Questions rapides). */
  const [desktopLeftPanel, setDesktopLeftPanel] = useState<"context" | "questions">("context");

  useEffect(() => {
    loadTaxRules();
    loadAlerts();
    loadCredits();
    loadAiHistory();
  }, []);

  /** Ouvre les alertes depuis le Header global + ferme au clavier. */
  useEffect(() => {
    const onOpen = () => {
      setShowAlerts(true);
      loadAlerts();
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAlerts(false);
    };
    window.addEventListener("compta-open-alerts", onOpen as EventListener);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("compta-open-alerts", onOpen as EventListener);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  const loadTaxRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetch("/api/tax-rules");
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
      const url = refresh ? "/api/legifrance?refresh=1" : "/api/legifrance";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLegalAlerts(data.alerts ?? []);
        setAlertsUnread((data.alerts ?? []).filter((a: LegalAlert) => !a.seen).length);
      }
    } catch { /* silent */ }
    finally { setLoadingAlerts(false); }
  };

  const markAlertSeen = async (id: string | "all") => {
    await fetch("/api/legifrance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLegalAlerts((prev) => prev.map((a) => id === "all" || a.id === id ? { ...a, seen: true } : a));
    setAlertsUnread(id === "all" ? 0 : Math.max(0, alertsUnread - 1));
  };

  const loadCredits = async () => {
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const res = await fetch("/api/billing/credits", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setCreditsBalance(typeof data.balance === "number" ? data.balance : null);
    } catch {
      // silent
    }
  };

  const loadAiHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const res = await fetch("/api/ai/history?limit=100", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setAiHistory(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
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
          provider: aiProvider,
          prompt: finalPrompt,
          ocrText: ocrContext || undefined,
          history: conversation
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (typeof data?.billing?.creditsRemaining === "number") {
        setCreditsBalance(data.billing.creditsRemaining);
      }
      const answer = data.answer || data.error || "Aucune réponse.";
      const providerLabel = AI_PROVIDERS.find((p) => p.id === aiProvider)?.label ?? aiProvider;
      const now = new Date();
      setConversation((prev) => [
        ...prev,
        { role: "assistant", content: answer, timestamp: now, provider: providerLabel },
      ]);
      setAiHistory((prev) => [
        {
          id: `tmp-${now.getTime()}`,
          prompt: finalPrompt,
          response: answer,
          region,
          createdAt: now.toISOString(),
        },
        ...prev,
      ]);
    } catch {
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erreur de connexion au service d'IA. Vérifiez votre clé dans .env (OPENAI_API_KEY, ANTHROPIC_API_KEY ou PERPLEXITY_API_KEY).",
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

  /** Rendu d'un tableau markdown : retourne un <table> stylisé. */
  const renderMarkdownTable = (tableLines: string[], key: number) => {
    const rows = tableLines
      .filter((l) => l.trim().startsWith("|"))
      .map((l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );

    if (rows.length < 2) return null;

    const header = rows[0];
    const body = rows.filter((_, i) => {
      // skip separator rows (e.g. |:---:|---|)
      if (i === 0) return false;
      return !rows[i].every((c) => /^[-:]+$/.test(c));
    });

    return (
      <div key={key} className="my-2 w-full overflow-x-auto rounded-lg border border-slate-200 sm:my-3">
        <table className="min-w-full text-[10px] sm:text-xs">
          <thead className="bg-slate-100">
            <tr>
              {header.map((h, ci) => (
                <th
                  key={ci}
                  className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-slate-700 sm:px-3 sm:py-2"
                >
                  {renderInlineMarkdown(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {body.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-slate-700 sm:px-3 sm:py-2">
                    {renderInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const formatAnswer = (text: string) => {
    // Pre-pass: group consecutive table lines into blocks
    const rawLines = text.split("\n");
    type Block =
      | { type: "table"; lines: string[]; startIdx: number }
      | { type: "line"; content: string; idx: number };

    const blocks: Block[] = [];
    let i = 0;
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trimEnd();
      if (trimmed.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith("|")) {
          tableLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: "table", lines: tableLines, startIdx: i });
      } else {
        blocks.push({ type: "line", content: trimmed, idx: i });
        i++;
      }
    }

    return blocks.map((block, blockIdx) => {
      if (block.type === "table") {
        return renderMarkdownTable(block.lines, blockIdx);
      }

      const trimmed = block.content;
      const lineKey = blockIdx;

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        const body = heading[2].replace(/^#+\s*/, "").trim();
        if (level <= 2) {
          return (
            <h3 key={lineKey} className="mt-3 mb-1.5 text-sm font-bold text-slate-900 sm:mt-4 sm:mb-2 sm:text-base">
              {renderInlineMarkdown(body)}
            </h3>
          );
        }
        return (
          <h4 key={lineKey} className="mt-2 mb-1 text-xs font-bold text-slate-800 sm:mt-3 sm:text-sm">
            {renderInlineMarkdown(body)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={lineKey} className="mt-3 mb-1.5 text-sm font-bold text-slate-900 sm:mt-4 sm:mb-2 sm:text-base">
            {renderInlineMarkdown(trimmed.slice(3))}
          </h3>
        );
      }
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={lineKey} className="mt-2 mb-1 text-xs font-bold text-slate-800 sm:mt-3 sm:text-sm">
            {renderInlineMarkdown(trimmed.slice(4))}
          </h4>
        );
      }
      if (trimmed.startsWith("---")) {
        return <hr key={lineKey} className="my-2 border-slate-200 sm:my-3" />;
      }
      if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
        return (
          <p key={lineKey} className="mt-1.5 text-xs font-semibold text-slate-900 sm:mt-2 sm:text-sm">
            {renderInlineMarkdown(trimmed.slice(2, -2))}
          </p>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return (
          <li key={lineKey} className="ml-3 list-disc text-xs leading-5 text-slate-700 sm:ml-4 sm:text-sm sm:leading-6">
            {renderInlineMarkdown(trimmed.slice(2))}
          </li>
        );
      }
      if (trimmed.match(/^\d+\./)) {
        return (
          <li key={lineKey} className="ml-3 list-decimal text-xs leading-5 text-slate-700 sm:ml-4 sm:text-sm sm:leading-6">
            {renderInlineMarkdown(trimmed.replace(/^\d+\.\s*/, ""))}
          </li>
        );
      }
      if (trimmed === "") return <div key={lineKey} className="h-1.5 sm:h-2" />;
      return (
        <p key={lineKey} className="text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
          {renderInlineMarkdown(trimmed)}
        </p>
      );
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-6 lg:px-6 lg:py-6">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:min-h-0 lg:space-y-6">
        <div className="mb-1 flex justify-end lg:hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600"
          >
            {showHistory ? "Chat" : "Historique"}
          </button>
        </div>

        {showAlerts && (
          <>
            <button
              type="button"
              aria-label="Fermer les alertes"
              className="fixed inset-0 z-[45] touch-manipulation bg-slate-900/25"
              onClick={() => setShowAlerts(false)}
            />
            <div className="fixed inset-x-2 top-16 z-50 max-h-[min(75dvh,560px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:inset-x-auto sm:right-6 sm:w-96 sm:max-h-80 sm:rounded-2xl">
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
                  <p className="py-6 text-center text-xs text-slate-400">
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

              {/* IA Provider */}
              <div>
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:mb-2 sm:text-xs sm:normal-case sm:tracking-normal">Modèle IA</span>
                <div className="flex gap-1.5">
                  {AI_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAiProvider(p.id)}
                      className={`flex flex-1 flex-col items-center rounded-lg border px-1.5 py-1.5 text-center transition sm:rounded-xl ${
                        aiProvider === p.id
                          ? p.color
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-[11px] font-semibold leading-tight sm:text-xs">{p.label}</span>
                      <span className={`text-[9px] leading-tight sm:text-[10px] ${aiProvider === p.id ? "opacity-80" : "text-slate-400"}`}>{p.desc}</span>
                    </button>
                  ))}
                </div>
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
                    Raccourcis vers l&apos;IA. Sélectionnez d&apos;abord le modèle et le pays.
                  </p>
                  {(["International", "France"] as const).map((cat) => (
                    <div key={cat} className="mb-2 sm:mb-3">
                      <p className={`mb-1 text-[9px] font-bold uppercase tracking-wider sm:text-[10px] ${cat === "International" ? "text-blue-600" : "text-slate-400"}`}>
                        {cat === "International" ? "Dividendes & Holdings Internationaux" : "Fiscalité France"}
                      </p>
                      <div className="space-y-1 sm:space-y-1.5">
                        {quickPrompts.filter((qp) => qp.category === cat).map((qp) => (
                          <button
                            type="button"
                            key={qp.title}
                            onClick={() => handleOptimize(qp.prompt)}
                            disabled={loading}
                            className={`flex w-full items-center rounded-lg border px-2 py-1.5 text-left text-[11px] transition disabled:opacity-50 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs ${
                              cat === "International"
                                ? "border-blue-100 bg-blue-50/50 text-blue-900 hover:bg-blue-50 hover:border-blue-200"
                                : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span className="font-medium leading-tight">{qp.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
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
              <div className="min-w-0 flex items-center gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900 sm:text-base">Conseiller fiscal IA</h2>
                  <p className="text-[10px] text-slate-400 sm:text-xs">
                    Dividendes internationaux · Holdings · Fiscalité France · Conventions fiscales
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${
                  AI_PROVIDERS.find((p) => p.id === aiProvider)?.color ?? ""
                }`}>
                  {AI_PROVIDERS.find((p) => p.id === aiProvider)?.label}
                </span>
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 sm:text-xs">
                  Crédits: {creditsBalance ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 sm:text-xs"
                >
                  {showHistory ? "Voir chat" : "Historique IA"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:space-y-6 sm:p-6">
              {showHistory ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900 sm:text-sm">Historique des réponses IA</h3>
                    <button
                      type="button"
                      onClick={() => loadAiHistory()}
                      disabled={loadingHistory}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:text-xs"
                    >
                      {loadingHistory ? "Chargement..." : "Actualiser"}
                    </button>
                  </div>
                  {loadingHistory ? (
                    <p className="text-xs text-slate-400">Chargement de l&apos;historique...</p>
                  ) : aiHistory.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune réponse IA enregistrée pour le moment.</p>
                  ) : (
                    aiHistory.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
                        <p className="mb-2 text-[10px] font-medium text-slate-500 sm:text-xs">
                          {new Date(item.createdAt).toLocaleString("fr-FR")} • {regionDisplayLabel(item.region)}
                        </p>
                        <p className="mb-2 text-xs font-semibold text-slate-900 sm:text-sm">
                          Question: {item.prompt}
                        </p>
                        <div className="space-y-0.5">{formatAnswer(item.response)}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : conversation.length === 0 ? (
                <div className="flex min-h-[min(40dvh,320px)] flex-col items-center justify-center py-8 text-center sm:py-12">
                    <h3 className="mb-1.5 text-sm font-semibold text-slate-900 sm:mb-2 sm:text-lg">
                    Expert fiscal IA — Dividendes & Holdings
                  </h3>
                  <p className="max-w-sm px-1 text-[11px] leading-snug text-slate-500 sm:text-sm">
                    Trouvez le meilleur pays pour vos dividendes (WHT ≤ 5%, impôt local ≤ 10%), analysez les conventions fiscales France, comparez Bulgarie / Maurice / Dubai et bien plus.
                  </p>
                  <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-1.5 px-1 sm:mt-6 sm:gap-2">
                    {quickPrompts.filter((qp) => qp.category === "International").slice(0, 4).map((qp) => (
                      <button
                        type="button"
                        key={qp.title}
                        onClick={() => handleOptimize(qp.prompt)}
                        disabled={loading}
                        className="flex w-full items-center rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-2 text-left text-[10px] text-blue-900 transition hover:bg-blue-50 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
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
                      <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
                        <p className="text-[10px] text-slate-400 sm:text-xs">
                          {msg.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {msg.role === "assistant" && msg.provider && (
                          <span className="text-[9px] font-medium text-slate-400 sm:text-[10px]">
                            via {msg.provider}
                          </span>
                        )}
                      </div>
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
              {/* Provider switcher inline (mobile + desktop) */}
              <div className="mb-2 flex gap-1.5 sm:mb-2.5">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAiProvider(p.id)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition sm:rounded-lg sm:px-2.5 sm:text-xs ${
                      aiProvider === p.id
                        ? p.color
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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
                  placeholder="Ex : Quel pays pour remonter mes dividendes à moins de 5% ? Quel est le statut de la convention France-Cambodge ?…"
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
                Entrée pour envoyer • Maj+Entrée pour nouvelle ligne • {AI_PROVIDERS.find((p) => p.id === aiProvider)?.label} actif
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
