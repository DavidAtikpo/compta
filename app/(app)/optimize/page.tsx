"use client";

import { useEffect, useState } from "react";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
];

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
    icon: "🎯",
    prompt: "Analyse ma situation complète et donne-moi TOUTES les optimisations fiscales possibles pour réduire au maximum mes impôts légalement. Inclus les dispositifs, déductions, crédits d'impôt et stratégies d'optimisation disponibles.",
  },
  {
    title: "TVA & Charges",
    icon: "📊",
    prompt: "Optimise ma TVA récupérable et mes charges déductibles. Quelles dépenses puis-je déduire à 100%, lesquelles partiellement ? Comment récupérer un maximum de TVA sur mes achats professionnels ?",
  },
  {
    title: "PER & Épargne retraite",
    icon: "🏦",
    prompt: "Explique-moi comment maximiser les déductions via le PER (Plan Épargne Retraite) et les contrats Madelin. Quel montant optimal dois-je verser pour réduire au maximum mon IR cette année ?",
  },
  {
    title: "Rémunération dirigeant",
    icon: "👔",
    prompt: "Quelle est la structure de rémunération optimale pour un dirigeant : salaire vs dividendes ? Calcule la charge fiscale et sociale dans chaque cas et recommande la meilleure stratégie.",
  },
  {
    title: "Immobilier & déficit",
    icon: "🏠",
    prompt: "Comment utiliser le déficit foncier, le LMNP et les dispositifs immobiliers (Denormandie, Malraux) pour réduire mes impôts ? Explique les plafonds et conditions.",
  },
  {
    title: "CIR & JEI",
    icon: "🔬",
    prompt: "Suis-je éligible au Crédit Impôt Recherche (CIR) ou au statut JEI (Jeune Entreprise Innovante) ? Quelles dépenses qualifient ? Quel montant puis-je récupérer ?",
  },
  {
    title: "International (Togo/Vietnam)",
    icon: "🌍",
    prompt: "Comment optimiser la fiscalité pour une activité internationale France-Togo-Vietnam ? Conventions fiscales, prix de transfert, TVA intracommunautaire, risques de double imposition.",
  },
  {
    title: "Holding & optimisation IS",
    icon: "🏢",
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

  useEffect(() => {
    loadTaxRules();
    loadAlerts();
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
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const formatAnswer = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("## ")) {
          return <h3 key={i} className="text-base font-bold text-slate-900 mt-4 mb-2">{line.slice(3)}</h3>;
        }
        if (line.startsWith("### ")) {
          return <h4 key={i} className="text-sm font-bold text-slate-800 mt-3 mb-1">{line.slice(4)}</h4>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-semibold text-slate-900 mt-2">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <li key={i} className="ml-4 text-sm text-slate-700 leading-6 list-disc">
              {line.slice(2).replace(/\*\*(.+?)\*\*/g, "$1")}
            </li>
          );
        }
        if (line.match(/^\d+\./)) {
          return (
            <li key={i} className="ml-4 text-sm text-slate-700 leading-6 list-decimal">
              {line.replace(/^\d+\.\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1")}
            </li>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm text-slate-700 leading-6">
            {line.replace(/\*\*(.+?)\*\*/g, "$1")}
          </p>
        );
      });
  };

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Optimisation fiscale IA</h1>
            <p className="text-slate-500 mt-1 text-sm">
              IA spécialisée en fiscalité française — barèmes 2024/2025, tous les dispositifs légaux disponibles
            </p>
          </div>
          {/* Alertes Légifrance */}
          <div className="relative shrink-0">
            <button
              onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) loadAlerts(); }}
              className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <div className="absolute right-0 top-full mt-2 z-50 w-96 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">Alertes Légifrance / JO</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadAlerts(true)}
                      disabled={loadingAlerts}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {loadingAlerts ? "…" : "Actualiser"}
                    </button>
                    {alertsUnread > 0 && (
                      <button onClick={() => markAlertSeen("all")} className="text-xs text-slate-400 hover:text-slate-600">
                        Tout marquer lu
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {legalAlerts.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      {loadingAlerts ? "Chargement…" : "Aucune alerte. Cliquez sur Actualiser."}
                    </p>
                  ) : (
                    legalAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition ${!alert.seen ? "bg-blue-50/50" : ""}`}
                        onClick={() => { markAlertSeen(alert.id); if (alert.url) window.open(alert.url, "_blank"); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-medium leading-snug ${!alert.seen ? "text-slate-900" : "text-slate-600"}`}>
                            {!alert.seen && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />}
                            {alert.title}
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOptimize(`Analyse cette mise à jour légale et son impact fiscal pour mon cas (${businessType}, ${region}) : "${alert.title}". ${alert.description}`); setShowAlerts(false); }}
                            className="shrink-0 text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          >
                            Analyser →
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{alert.description}</p>
                        <p className="text-[10px] text-slate-300 mt-1">
                          {new Date(alert.pubDate).toLocaleDateString("fr-FR")} — {alert.source}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left panel — context + quick prompts */}
          <div className="space-y-5">
            {/* Context */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-900 text-sm">Contexte</h2>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Pays / Région</label>
                <div className="grid grid-cols-2 gap-2">
                  {regionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRegion(opt.value)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                        region === opt.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span>{opt.flag}</span> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Type d'entreprise / Situation</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
                >
                  {businessTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  Contexte OCR (coller le texte extrait d'une facture)
                </label>
                <textarea
                  value={ocrContext}
                  onChange={(e) => setOcrContext(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400 resize-none"
                  placeholder="Collez ici le texte extrait par OCR de vos factures pour une analyse personnalisée…"
                />
              </div>
            </div>

            {/* Quick prompts */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h2 className="font-semibold text-slate-900 text-sm mb-3">Questions rapides</h2>
              <div className="space-y-2">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp.title}
                    onClick={() => handleOptimize(qp.prompt)}
                    disabled={loading}
                    className="w-full flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="text-base shrink-0">{qp.icon}</span>
                    <span className="font-medium">{qp.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tax rules panel */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition"
              >
                <span>Dispositifs fiscaux 2024/2025</span>
                <svg className={`h-4 w-4 transition-transform ${showRules ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showRules && (
                <div className="border-t border-slate-100 px-5 pb-5 space-y-3 max-h-96 overflow-y-auto">
                  {loadingRules ? (
                    <p className="text-xs text-slate-400 pt-3">Chargement…</p>
                  ) : taxRules.length === 0 ? (
                    <p className="text-xs text-slate-400 pt-3">Aucun dispositif chargé.</p>
                  ) : (
                    taxRules.map((rule, i) => (
                      <div key={i} className="pt-3">
                        <p className="text-xs font-bold text-slate-900">{rule.nom}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{rule.description}</p>
                        <p className="text-xs text-emerald-700 mt-0.5 font-medium">{rule.avantage}</p>
                        {rule.plafond && <p className="text-xs text-slate-400">Plafond : {rule.plafond}</p>}
                        <button
                          onClick={() => handleOptimize(`Explique-moi en détail le dispositif "${rule.nom}" et comment l'optimiser pour mon cas (${businessType}, région ${region}).`)}
                          className="mt-1.5 text-xs text-blue-600 hover:text-blue-700"
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

          {/* Right panel — chat */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden" style={{ minHeight: "600px" }}>
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Conseiller fiscal IA</h2>
                <p className="text-xs text-slate-400">
                  Basé sur la Loi de Finances 2024/2025 — BOFIP — CGI — CSS
                </p>
              </div>
              {conversation.length > 0 && (
                <button
                  onClick={() => setConversation([])}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Effacer
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {conversation.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="text-5xl mb-4">🇫🇷</div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Expert fiscal IA à votre service
                  </h3>
                  <p className="text-sm text-slate-500 max-w-sm">
                    Posez une question ou utilisez les prompts rapides pour obtenir un conseil fiscal personnalisé basé sur la législation française en vigueur.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-2 w-full max-w-sm">
                    {quickPrompts.slice(0, 4).map((qp) => (
                      <button
                        key={qp.title}
                        onClick={() => handleOptimize(qp.prompt)}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-left text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                      >
                        <span>{qp.icon}</span>
                        <span className="font-medium">{qp.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 text-sm font-bold mt-1">
                        IA
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-slate-900 text-white text-sm"
                          : "bg-slate-50 border border-slate-200"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="text-sm leading-6">{msg.content}</p>
                      ) : (
                        <div className="space-y-1">{formatAnswer(msg.content)}</div>
                      )}
                      <p className={`text-xs mt-2 ${msg.role === "user" ? "text-slate-400" : "text-slate-400"}`}>
                        {msg.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {msg.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600 text-xs font-bold mt-1">
                        Moi
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 text-sm font-bold">
                    IA
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Analyse fiscale en cours…</p>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-4">
              <div className="flex gap-3">
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
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none resize-none"
                  placeholder="Ex : Comment optimiser mes impôts en tant que gérant de SARL ? Quelles charges puis-je déduire ?…"
                  disabled={loading}
                />
                <button
                  onClick={() => handleOptimize()}
                  disabled={loading || !prompt.trim()}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white font-medium transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Entrée pour envoyer • Maj+Entrée pour nouvelle ligne • Données fiscales France 2024/2025
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
