"use client";

import { useEffect, useState, type ChangeEvent } from "react";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷", envKey: "ACCOUNTANT_EMAIL_FRANCE" },
  { value: "togo", label: "Togo", flag: "🇹🇬", envKey: "ACCOUNTANT_EMAIL_TOGO" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳", envKey: "ACCOUNTANT_EMAIL_VIETNAM" },
  { value: "autre", label: "Autre", flag: "🌍", envKey: "ACCOUNTANT_EMAIL_AUTRE" },
];

type AccountEmails = Record<string, string>;

const defaultEmails: AccountEmails = {
  france: "",
  togo: "",
  vietnam: "",
  autre: "",
};

export default function SettingsPage() {
  const [accountEmails, setAccountEmails] = useState<AccountEmails>(defaultEmails);
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountants();
  }, []);

  const loadAccountants = async () => {
    try {
      const res = await fetch("/api/accountants");
      if (res.ok) {
        const list: { region: string; email: string }[] = await res.json();
        const emailMap: AccountEmails = { ...defaultEmails };
        list.forEach((acc) => {
          if (emailMap[acc.region] !== undefined) {
            emailMap[acc.region] = acc.email;
          }
        });
        setAccountEmails(emailMap);
      }
    } catch (err) {
      console.error("Erreur chargement comptables:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (region: string, value: string) => {
    setAccountEmails((cur) => ({ ...cur, [region]: value }));
  };

  const handleSave = async () => {
    setSavedMessage("Sauvegarde en cours…");
    try {
      await Promise.all(
        Object.entries(accountEmails)
          .filter(([, email]) => email.trim() !== "")
          .map(([region, email]) =>
            fetch("/api/accountants", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ region, email }),
            })
          )
      );
      setSavedMessage("Paramètres enregistrés avec succès.");
    } catch {
      setSavedMessage("Erreur lors de la sauvegarde.");
    }
    setTimeout(() => setSavedMessage(""), 4000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-64 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Configurez les adresses des cabinets par pays. Ces emails sont utilisés pour l'envoi automatique des pièces justificatives.
          </p>
        </div>

        {/* Cabinet emails */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Emails des cabinets comptables</h2>
            <p className="text-xs text-slate-400 mt-1">
              Ces adresses sont prioritaires sur les variables d'environnement.
            </p>
          </div>
          <div className="p-6 space-y-5">
            {regionOptions.map((opt) => (
              <div key={opt.value} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{opt.flag}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{opt.label}</p>
                    <p className="text-xs text-slate-400">Cabinet {opt.label} — env : {opt.envKey}</p>
                  </div>
                </div>
                <input
                  type="email"
                  value={accountEmails[opt.value] || ""}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleChange(opt.value, e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-100"
                  placeholder={`Email du cabinet ${opt.label}…`}
                />
              </div>
            ))}

            <button
              onClick={handleSave}
              className="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Enregistrer les paramètres
            </button>
            {savedMessage && (
              <p className={`text-sm text-center rounded-xl px-4 py-3 ${
                savedMessage.includes("Erreur")
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}>
                {savedMessage}
              </p>
            )}
          </div>
        </div>

        {/* Info section */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Configuration système</h2>
          <div className="grid gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="font-medium text-slate-800 mb-2">Variables d'environnement (.env)</p>
              <ul className="space-y-1.5 text-slate-600 text-xs font-mono">
                <li><span className="text-blue-600">OPENAI_API_KEY</span> — Clé OpenAI pour l'IA fiscale</li>
                <li><span className="text-blue-600">FRANCE_API_KEY</span> — Clé API République Française</li>
                <li><span className="text-blue-600">DATABASE_URL</span> — PostgreSQL (Neon)</li>
                <li><span className="text-blue-600">JWT_SECRET</span> — Secret authentification</li>
                <li><span className="text-blue-600">SMTP_HOST / SMTP_USER / SMTP_PASS</span> — Email</li>
                <li><span className="text-blue-600">ACCOUNTANT_EMAIL_FRANCE/TOGO/VIETNAM/AUTRE</span> — Fallback emails</li>
              </ul>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="font-medium text-blue-900 mb-1">Priorité des emails</p>
              <ol className="space-y-1 text-xs text-blue-800 list-decimal list-inside">
                <li>Email configuré ci-dessus (base de données)</li>
                <li>Variable d'environnement ACCOUNTANT_EMAIL_*</li>
                <li>Erreur — configuration requise</li>
              </ol>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
              <p className="font-medium text-amber-900 mb-1">Clé API République Française</p>
              <p className="text-xs text-amber-800">
                La clé FRANCE_API_KEY est utilisée pour récupérer les données fiscales officielles (DGFIP/AIFE) en temps réel. Elle alimente l'IA avec la législation à jour.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
