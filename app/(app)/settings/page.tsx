"use client";

import { useEffect, useState, type ChangeEvent } from "react";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷", envKey: "ACCOUNTANT_EMAIL_FRANCE" },
  { value: "togo", label: "Togo", flag: "🇹🇬", envKey: "ACCOUNTANT_EMAIL_TOGO" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳", envKey: "ACCOUNTANT_EMAIL_VIETNAM" },
  { value: "autre", label: "Autre", flag: "🌍", envKey: "ACCOUNTANT_EMAIL_AUTRE" },
];

const businessTypes = [
  "Auto-entrepreneur / Micro",
  "EURL / SASU",
  "SARL",
  "SAS",
  "SCI",
  "Association loi 1901",
  "Profession libérale BNC",
  "Holding IS",
  "Salarié / Particulier",
];

type AccountEmails = Record<string, string>;

interface Structure {
  id: string;
  name: string;
  region: string;
  type: string;
  siret: string | null;
}

const defaultEmails: AccountEmails = { france: "", togo: "", vietnam: "", autre: "" };

export default function SettingsPage() {
  const [accountEmails, setAccountEmails] = useState<AccountEmails>(defaultEmails);
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // Structures
  const [structures, setStructures] = useState<Structure[]>([]);
  const [newStruct, setNewStruct] = useState({ name: "", region: "france", type: "EURL / SASU", siret: "" });
  const [structMsg, setStructMsg] = useState("");
  const [savingStruct, setSavingStruct] = useState(false);

  // Import email
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState("993");
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [imapRegion, setImapRegion] = useState("france");
  const [importResult, setImportResult] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadAccountants();
    loadStructures();
  }, []);

  const loadAccountants = async () => {
    try {
      const res = await fetch("/api/accountants");
      if (res.ok) {
        const list: { region: string; email: string }[] = await res.json();
        const emailMap: AccountEmails = { ...defaultEmails };
        list.forEach((acc) => { if (emailMap[acc.region] !== undefined) emailMap[acc.region] = acc.email; });
        setAccountEmails(emailMap);
      }
    } catch (err) {
      console.error("Erreur chargement comptables:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStructures = async () => {
    try {
      const res = await fetch("/api/structures");
      if (res.ok) setStructures(await res.json());
    } catch { /* silent */ }
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

  const handleAddStructure = async () => {
    if (!newStruct.name.trim()) return;
    setSavingStruct(true);
    setStructMsg("");
    try {
      const res = await fetch("/api/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStruct),
      });
      if (res.ok) {
        setStructMsg("Structure ajoutée.");
        setNewStruct({ name: "", region: "france", type: "EURL / SASU", siret: "" });
        await loadStructures();
      } else {
        const d = await res.json();
        setStructMsg(d.error ?? "Erreur.");
      }
    } catch {
      setStructMsg("Erreur réseau.");
    } finally {
      setSavingStruct(false);
      setTimeout(() => setStructMsg(""), 4000);
    }
  };

  const handleDeleteStructure = async (id: string) => {
    await fetch("/api/structures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadStructures();
  };

  const handleEmailImport = async () => {
    setImporting(true);
    setImportResult("");
    try {
      const res = await fetch("/api/email-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: imapHost,
          port: parseInt(imapPort),
          user: imapUser,
          password: imapPass,
          region: imapRegion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult(data.error ?? "Erreur.");
      } else {
        setImportResult(`✓ ${data.imported} facture(s) importée(s) depuis ${data.emailsFound} email(s).${data.errors?.length > 0 ? ` Erreurs: ${data.errors.join(", ")}` : ""}`);
      }
    } catch {
      setImportResult("Impossible de joindre le serveur.");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-64 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Cabinets, structures juridiques, import email, configuration système.
          </p>
        </div>

        {/* Emails cabinets */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Emails des cabinets comptables</h2>
            <p className="text-xs text-slate-400 mt-1">Prioritaires sur les variables d'environnement.</p>
          </div>
          <div className="p-6 space-y-5">
            {regionOptions.map((opt) => (
              <div key={opt.value} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{opt.flag}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{opt.label}</p>
                    <p className="text-xs text-slate-400">env : {opt.envKey}</p>
                  </div>
                </div>
                <input
                  type="email"
                  value={accountEmails[opt.value] || ""}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(opt.value, e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  placeholder={`Email du cabinet ${opt.label}…`}
                />
              </div>
            ))}
            <button onClick={handleSave} className="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700">
              Enregistrer les cabinets
            </button>
            {savedMessage && (
              <p className={`text-sm text-center rounded-xl px-4 py-3 ${savedMessage.includes("Erreur") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {savedMessage}
              </p>
            )}
          </div>
        </div>

        {/* Multi-structure */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Structures juridiques</h2>
            <p className="text-xs text-slate-400 mt-1">Gérez plusieurs entités (sociétés, associations) par pays.</p>
          </div>
          <div className="p-6 space-y-5">
            {structures.length > 0 && (
              <ul className="space-y-2">
                {structures.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-400">
                        {regionOptions.find((r) => r.value === s.region)?.flag} {s.region} — {s.type}
                        {s.siret ? ` — SIRET ${s.siret}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteStructure(s.id)}
                      className="text-xs text-rose-500 hover:text-rose-700 transition"
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-800">Ajouter une structure</p>
              <input
                type="text"
                value={newStruct.name}
                onChange={(e) => setNewStruct((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                placeholder="Nom de la société / structure"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newStruct.region}
                  onChange={(e) => setNewStruct((s) => ({ ...s, region: e.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none"
                >
                  {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.flag} {o.label}</option>)}
                </select>
                <select
                  value={newStruct.type}
                  onChange={(e) => setNewStruct((s) => ({ ...s, type: e.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none"
                >
                  {businessTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <input
                type="text"
                value={newStruct.siret}
                onChange={(e) => setNewStruct((s) => ({ ...s, siret: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                placeholder="SIRET (optionnel)"
              />
              <button
                onClick={handleAddStructure}
                disabled={savingStruct || !newStruct.name.trim()}
                className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition"
              >
                {savingStruct ? "Ajout…" : "Ajouter la structure"}
              </button>
              {structMsg && (
                <p className={`text-xs text-center rounded-lg px-3 py-2 ${structMsg.includes("Erreur") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {structMsg}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Import par email */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Import de factures par email (IMAP)</h2>
            <p className="text-xs text-slate-400 mt-1">
              Connectez votre boîte email pour importer automatiquement les pièces jointes (PDF, images) des emails non lus des 7 derniers jours.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serveur IMAP</label>
                <input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="imap.gmail.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Port</label>
                <input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={imapUser}
                onChange={(e) => setImapUser(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none"
                placeholder="votre@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe / App Password</label>
              <input
                type="password"
                value={imapPass}
                onChange={(e) => setImapPass(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none"
                placeholder="Mot de passe ou app password Gmail"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Affecter à la région</label>
              <div className="grid grid-cols-4 gap-2">
                {regionOptions.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setImapRegion(o.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-medium transition ${
                      imapRegion === o.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span>{o.flag}</span>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-800">
                <strong>Gmail :</strong> activez l'accès IMAP dans les paramètres Gmail et utilisez un <em>App Password</em> (Compte Google → Sécurité → Mots de passe des applications).
              </p>
            </div>
            <button
              onClick={handleEmailImport}
              disabled={importing || !imapUser || !imapPass}
              className="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Import en cours…" : "Importer les factures par email"}
            </button>
            {importResult && (
              <p className={`text-sm text-center rounded-xl px-4 py-3 ${importResult.includes("Erreur") || importResult.includes("impossible") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {importResult}
              </p>
            )}
          </div>
        </div>

        {/* Config système */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Configuration système</h2>
          <div className="grid gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="font-medium text-slate-800 mb-2">Variables d'environnement (.env)</p>
              <ul className="space-y-1.5 text-slate-600 text-xs font-mono">
                <li><span className="text-blue-600">OPENAI_API_KEY</span> — IA fiscale (GPT-4o)</li>
                <li><span className="text-blue-600">CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET</span> — Stockage fichiers</li>
                <li><span className="text-blue-600">DATABASE_URL</span> — PostgreSQL (Neon)</li>
                <li><span className="text-blue-600">JWT_SECRET</span> — Authentification</li>
                <li><span className="text-blue-600">SMTP_HOST / SMTP_USER / SMTP_PASS</span> — Email sortant</li>
                <li><span className="text-blue-600">IMAP_HOST / IMAP_USER / IMAP_PASS</span> — Email entrant (optionnel)</li>
                <li><span className="text-blue-600">NEXT_PUBLIC_BASE_URL</span> — URL publique (liens partage)</li>
                <li><span className="text-blue-600">ACCOUNTANT_EMAIL_FRANCE/TOGO/VIETNAM/AUTRE</span> — Fallback emails</li>
              </ul>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="font-medium text-blue-900 mb-1">Fonctionnalités disponibles</p>
              <ul className="space-y-1 text-xs text-blue-800">
                <li>✅ OCR automatique (Tesseract.js) + extraction IA structurée (GPT-4o Vision)</li>
                <li>✅ Stockage cloud Cloudinary (PDF & images)</li>
                <li>✅ Lien de partage public par facture</li>
                <li>✅ Export FEC (Fichier des Écritures Comptables)</li>
                <li>✅ Alertes Légifrance / Journal Officiel en temps réel</li>
                <li>✅ Import factures par email (IMAP)</li>
                <li>✅ Multi-structures / Multi-pays</li>
                <li>✅ Transmission email au bon cabinet selon région</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
