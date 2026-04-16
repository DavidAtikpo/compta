"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Tesseract from "tesseract.js";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
];

const categoryOptions = [
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
];

interface Invoice {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  category: string | null;
  ocrText: string | null;
  createdAt: string;
  sentAt: string | null;
  accountant_email: string | null;
}

export default function InvoicesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  // Upload/capture state
  const [files, setFiles] = useState<File[]>([]);
  const [region, setRegion] = useState("france");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [extractedTexts, setExtractedTexts] = useState<{ name: string; text: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  // List state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("compta-token");
    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken);
    }
    loadInvoices();
  }, []);

  const fetchMe = async (t: string) => {
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (res.ok) setUserEmail(data.email);
    } catch { /* silent */ }
  };

  const loadInvoices = async (region?: string, status?: string) => {
    setLoadingList(true);
    try {
      let url = "/api/invoices?limit=100";
      if (region) url += `&region=${region}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url);
      if (res.ok) setInvoices(await res.json());
    } catch (err) {
      console.error("Erreur chargement factures:", err);
    } finally {
      setLoadingList(false);
    }
  };

  const runOcr = async (imageFiles: File[]): Promise<{ name: string; text: string }[]> => {
    const results: { name: string; text: string }[] = [];
    for (const file of imageFiles) {
      setOcrStatus(`OCR en cours : ${file.name}…`);
      try {
        const result = await Tesseract.recognize(file, "fra+eng", {
          logger: ({ status, progress }) => {
            if (status === "recognizing text") {
              setOcrStatus(`OCR ${file.name} — ${Math.round(progress * 100)}%`);
            }
          },
        });
        const text = result.data.text.trim();
        results.push({ name: file.name, text: text || "Aucun texte détecté." });

        // Auto-detect amount from OCR
        if (!amount) {
          const amountMatch = text.match(/(?:total|montant|ttc|ht)[^\d]*(\d+[,.]?\d*)/i);
          if (amountMatch) {
            setAmount(amountMatch[1].replace(",", "."));
          }
        }
      } catch (err) {
        results.push({ name: file.name, text: `Erreur OCR: ${(err as Error).message}` });
      }
    }
    return results;
  };

  const handleFiles = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setFiles((prev) => [...prev, ...newFiles]);
    setUploadResult("");
    setSendResult("");
    setExtractedTexts([]);
    setOcrStatus("Démarrage OCR…");

    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      const texts = await runOcr(imageFiles);
      setExtractedTexts((prev) => [...prev, ...texts]);
      setOcrStatus(`OCR terminé — ${texts.length} fichier(s) analysé(s).`);
    } else {
      setOcrStatus("PDF détecté — sera transmis tel quel.");
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  };

  const handleSaveInvoices = async () => {
    if (files.length === 0) {
      setUploadResult("Aucun fichier à enregistrer.");
      return;
    }
    setUploading(true);
    setUploadResult("");
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ocrText = extractedTexts[i]?.text || null;
        await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            originalName: file.name,
            size: file.size,
            mimeType: file.type,
            ocrText,
            region,
            amount: amount ? parseFloat(amount) : null,
            category: category || null,
          }),
        });
      }
      setUploadResult(`${files.length} facture(s) enregistrée(s) avec succès.`);
      loadInvoices(filterRegion || undefined, filterStatus || undefined);
    } catch {
      setUploadResult("Erreur lors de l'enregistrement.");
    } finally {
      setUploading(false);
    }
  };

  const handleSendToAccountant = async () => {
    if (files.length === 0) {
      setSendResult("Aucun fichier à envoyer.");
      return;
    }
    setSending(true);
    setSendResult("");

    const formData = new FormData();
    formData.append("region", region);
    formData.append(
      "message",
      message ||
        `Transmission de ${files.length} pièce(s) justificative(s).\nRégion : ${region}\n${category ? `Catégorie : ${category}\n` : ""}${amount ? `Montant : ${amount} €\n` : ""}${
          extractedTexts.length > 0
            ? `\nTexte OCR extrait :\n${extractedTexts.map((t) => t.text).join("\n\n").slice(0, 2000)}`
            : ""
        }`
    );
    formData.append("senderName", userEmail || "Utilisateur Compta IA");
    files.forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("/api/send-to-accountant", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSendResult(data.error || "Erreur lors de l'envoi.");
      } else {
        setSendResult(data.message || "Envoyé avec succès.");
        // Auto-save after send
        await handleSaveInvoices();
      }
    } catch {
      setSendResult("Impossible de joindre le service d'envoi.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setExtractedTexts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setFiles([]);
    setExtractedTexts([]);
    setOcrStatus("");
    setUploadResult("");
    setSendResult("");
    setAmount("");
    setCategory("");
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures &amp; Pièces justificatives</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Capturez une photo ou importez un PDF — OCR automatique et envoi au cabinet
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Capture section */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Nouvelle capture</h2>
            </div>
            <div className="p-6 space-y-5">
              {/* Camera + file buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-medium">Appareil photo</span>
                  <span className="text-xs text-slate-400">Prendre une photo</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm font-medium">Importer</span>
                  <span className="text-xs text-slate-400">Image ou PDF</span>
                </button>
              </div>

              {/* Hidden inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />

              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Région / Pays du cabinet</label>
                <div className="grid grid-cols-4 gap-2">
                  {regionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRegion(opt.value)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-medium transition ${
                        region === opt.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-base">{opt.flag}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Catégorie</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Montant (€)
                  <span className="text-xs text-slate-400 ml-1">— détecté automatiquement par OCR</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Message au comptable (optionnel)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none resize-none"
                  placeholder="Notes ou informations supplémentaires…"
                />
              </div>

              {/* Files list */}
              {files.length > 0 && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-800">{files.length} fichier(s) sélectionné(s)</p>
                    <button onClick={handleClearAll} className="text-xs text-slate-400 hover:text-rose-600">Tout effacer</button>
                  </div>
                  <ul className="space-y-2">
                    {files.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="flex items-center justify-between text-sm text-slate-700">
                        <span className="truncate flex-1 mr-2">{file.name} <span className="text-slate-400">({Math.round(file.size / 1024)} ko)</span></span>
                        <button onClick={() => handleDeleteFile(i)} className="text-rose-400 hover:text-rose-600 shrink-0">✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* OCR status */}
              {ocrStatus && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                  <p className="text-sm text-blue-800 font-medium">{ocrStatus}</p>
                </div>
              )}

              {/* Extracted texts */}
              {extractedTexts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Texte extrait par OCR :</p>
                  {extractedTexts.map((item, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">{item.name}</p>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-5 max-h-40 overflow-y-auto">
                        {item.text}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleSaveInvoices}
                  disabled={uploading || files.length === 0}
                  className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  onClick={handleSendToAccountant}
                  disabled={sending || files.length === 0}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Envoi…" : "Envoyer au cabinet"}
                </button>
              </div>

              {uploadResult && (
                <p className={`text-sm rounded-xl px-4 py-3 ${uploadResult.includes("Erreur") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {uploadResult}
                </p>
              )}
              {sendResult && (
                <p className={`text-sm rounded-xl px-4 py-3 ${sendResult.includes("Erreur") || sendResult.includes("Aucun") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {sendResult}
                </p>
              )}
            </div>
          </div>

          {/* Invoice list */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-900">Historique des factures</h2>
                <button
                  onClick={() => loadInvoices(filterRegion || undefined, filterStatus || undefined)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Actualiser
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={filterRegion}
                  onChange={(e) => {
                    setFilterRegion(e.target.value);
                    loadInvoices(e.target.value || undefined, filterStatus || undefined);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="">Toutes régions</option>
                  {regionOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    loadInvoices(filterRegion || undefined, e.target.value || undefined);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="">Tous statuts</option>
                  <option value="pending">En attente</option>
                  <option value="sent">Envoyé</option>
                  <option value="archived">Archivé</option>
                </select>
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "600px" }}>
              {loadingList ? (
                <div className="p-6 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-sm">Aucune facture trouvée.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="px-6 py-3 hover:bg-slate-50 transition">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base shrink-0">
                            {regionOptions.find((r) => r.value === inv.region)?.flag || "🌍"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{inv.originalName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {regionOptions.find((r) => r.value === inv.region)?.label || inv.region}
                              {inv.category ? ` • ${inv.category}` : ""}
                              {" • "}
                              {new Date(inv.createdAt).toLocaleDateString("fr-FR")}
                            </p>
                            {inv.accountant_email && (
                              <p className="text-xs text-slate-400 truncate">→ {inv.accountant_email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {inv.amount != null && (
                            <span className="text-sm font-semibold text-slate-800">{inv.amount.toFixed(2)} €</span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            inv.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : inv.status === "archived"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {inv.status === "sent" ? "Envoyé" : inv.status === "archived" ? "Archivé" : "En attente"}
                          </span>
                        </div>
                      </div>
                      {inv.ocrText && (
                        <details className="mt-2">
                          <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700">Voir texte OCR</summary>
                          <pre className="mt-1 text-xs text-slate-600 whitespace-pre-wrap leading-4 max-h-28 overflow-y-auto rounded bg-slate-50 p-2 border border-slate-100">
                            {inv.ocrText.slice(0, 500)}
                            {inv.ocrText.length > 500 ? "…" : ""}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
