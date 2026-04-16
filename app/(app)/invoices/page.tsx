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
  fileUrl: string | null;
  shareToken: string | null;
  fournisseur: string | null;
  numeroFacture: string | null;
  montantHT: number | null;
  montantTVA: number | null;
  montantTTC: number | null;
}

export default function InvoicesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [region, setRegion] = useState("france");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [extractedTexts, setExtractedTexts] = useState<{ name: string; text: string }[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractResults, setExtractResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  const fetchMe = async (t: string) => {
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (data.email) setUserEmail(data.email);
    } catch { /* silent */ }
  };

  const loadInvoices = async (reg?: string, status?: string) => {
    setLoadingList(true);
    try {
      let url = "/api/invoices?limit=100";
      if (reg) url += `&region=${reg}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: Invoice[] = await res.json();
        setInvoices(data);
        const links: Record<string, string> = {};
        data.forEach((inv) => {
          if (inv.shareToken) {
            links[inv.id] = `${window.location.origin}/share/${inv.shareToken}`;
          }
        });
        setShareLinks(links);
      }
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
        if (!amount) {
          const m = text.match(/(?:total|montant|ttc|ht)[^\d]*(\d+[,.]?\d*)/i);
          if (m) setAmount(m[1].replace(",", "."));
        }
      } catch (err) {
        results.push({ name: file.name, text: `Erreur OCR: ${(err as Error).message}` });
      }
    }
    return results;
  };

  const uploadToCloudinary = async (file: File): Promise<{ url: string } | { error: string }> => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: data.error || `Erreur ${res.status}` };
      }
      if (!data.url) return { error: "URL manquante dans la réponse Cloudinary" };
      return { url: data.url };
    } catch (e) {
      return { error: (e as Error).message || "Erreur réseau" };
    }
  };

  const handleFiles = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Filter: only accept images and PDFs
    const validFiles = newFiles.filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    const rejected = newFiles.filter((f) =>
      !f.type.startsWith("image/") && f.type !== "application/pdf"
    );

    if (validFiles.length === 0) {
      setUploadResult(`Fichiers non supportés : ${rejected.map((f) => f.name).join(", ")}. Acceptés : images et PDF.`);
      return;
    }

    setFiles((prev) => [...prev, ...validFiles]);
    setUploadResult("");
    setSendResult("");
    setOcrStatus("Traitement en cours…");

    const imageFiles = validFiles.filter((f) => f.type.startsWith("image/"));
    const pdfFiles   = validFiles.filter((f) => f.type === "application/pdf");

    // OCR sur les images
    if (imageFiles.length > 0) {
      const texts = await runOcr(imageFiles);
      setExtractedTexts((prev) => [...prev, ...texts]);
      setOcrStatus(`OCR terminé — ${texts.length} image(s) analysée(s).`);
    }

    if (pdfFiles.length > 0) {
      setOcrStatus(`${pdfFiles.length} PDF(s) prêt(s) — texte extrait via IA après enregistrement.`);
    }

    // Upload vers Cloudinary
    setOcrStatus((s) => `${s} Envoi vers Cloudinary…`);
    const urls: { name: string; url: string }[] = [];
    const uploadErrors: string[] = [];

    for (const file of validFiles) {
      const result = await uploadToCloudinary(file);
      if ("url" in result) {
        urls.push({ name: file.name, url: result.url });
      } else {
        uploadErrors.push(`${file.name} : ${result.error}`);
        console.error("Upload Cloudinary échoué:", file.name, result.error);
      }
    }

    setUploadedUrls((prev) => [...prev, ...urls]);

    if (uploadErrors.length > 0) {
      setUploadResult(`⚠️ Erreur upload : ${uploadErrors.join(" | ")}`);
      setOcrStatus(`${urls.length}/${validFiles.length} fichier(s) uploadé(s).`);
    } else {
      setOcrStatus(`✓ ${urls.length} fichier(s) uploadé(s) sur Cloudinary.`);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  };

  const handleSaveInvoices = async () => {
    if (files.length === 0) { setUploadResult("Aucun fichier à enregistrer."); return; }
    setUploading(true);
    setUploadResult("");
    const savedIds: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ocrText = extractedTexts[i]?.text || null;
        const fileUrl = uploadedUrls.find((u) => u.name === file.name)?.url || null;
        const res = await fetch("/api/invoices", {
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
            fileUrl,
          }),
        });
        if (res.ok) {
          const inv = await res.json();
          savedIds.push(inv.id);
          // Auto-extract comptable data pour PDFs ou images uploadées
          if (fileUrl && inv.id) {
            fetch(`/api/invoices/${inv.id}/extract`, { method: "POST" }).catch(() => {});
          }
        }
      }
      setUploadResult(`${savedIds.length} facture(s) enregistrée(s) et analysée(s).`);
      loadInvoices(filterRegion || undefined, filterStatus || undefined);
      handleClearAll();
      setCreateOpen(false);
    } catch {
      setUploadResult("Erreur lors de l'enregistrement.");
    } finally {
      setUploading(false);
    }
  };

  const handleSendToAccountant = async () => {
    if (files.length === 0) { setSendResult("Aucun fichier à envoyer."); return; }
    setSending(true);
    setSendResult("");
    const formData = new FormData();
    formData.append("region", region);
    formData.append(
      "message",
      message || `Transmission de ${files.length} pièce(s).\nRégion : ${region}${category ? `\nCatégorie : ${category}` : ""}${amount ? `\nMontant : ${amount} €` : ""}${extractedTexts.length > 0 ? `\n\nTexte OCR :\n${extractedTexts.map((t) => t.text).join("\n\n").slice(0, 2000)}` : ""}`
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
        await handleSaveInvoices();
      }
    } catch {
      setSendResult("Impossible de joindre le service d'envoi.");
    } finally {
      setSending(false);
    }
  };

  const handleExtract = async (id: string) => {
    setExtractingId(id);
    setExtractResults((prev) => ({ ...prev, [id]: { ok: true, msg: "" } }));
    try {
      const res = await fetch(`/api/invoices/${id}/extract`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        const d = json.data ?? {};
        const parts: string[] = [];
        if (d.fournisseur)    parts.push(d.fournisseur);
        if (d.montantTTC)     parts.push(`TTC: ${Number(d.montantTTC).toFixed(2)} €`);
        if (d.montantHT)      parts.push(`HT: ${Number(d.montantHT).toFixed(2)} €`);
        if (d.numeroFacture)  parts.push(`N°${d.numeroFacture}`);
        const msg = parts.length > 0 ? `✓ ${parts.join(" · ")}` : "✓ Extrait (aucune donnée trouvée)";
        setExtractResults((prev) => ({ ...prev, [id]: { ok: true, msg } }));
        await loadInvoices(filterRegion || undefined, filterStatus || undefined);
      } else {
        const errMsg = json.error || `Erreur ${res.status}`;
        setExtractResults((prev) => ({ ...prev, [id]: { ok: false, msg: `✗ ${errMsg}` } }));
      }
    } catch (e) {
      setExtractResults((prev) => ({ ...prev, [id]: { ok: false, msg: `✗ Erreur réseau` } }));
      void e;
    } finally {
      setExtractingId(null);
      setTimeout(() => setExtractResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 6000);
    }
  };

  const handleShare = async (id: string) => {
    setSharingId(id);
    try {
      const res = await fetch(`/api/invoices/${id}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareLinks((prev) => ({ ...prev, [id]: data.url }));
        await navigator.clipboard.writeText(data.url).catch(() => {});
        alert(`Lien copié !\n${data.url}`);
      }
    } catch { /* silent */ }
    finally { setSharingId(null); }
  };

  const handleDeleteFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setExtractedTexts((prev) => prev.filter((_, i) => i !== index));
    setUploadedUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setFiles([]);
    setExtractedTexts([]);
    setUploadedUrls([]);
    setOcrStatus("");
    setUploadResult("");
    setSendResult("");
    setAmount("");
    setCategory("");
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const exportFEC = (reg?: string) => {
    let url = "/api/export/fec";
    if (reg) url += `?region=${reg}`;
    window.open(url, "_blank");
  };

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Factures &amp; Pièces justificatives</h1>
            <p className="mt-1 text-sm text-slate-500">OCR automatique, stockage cloud, extraction IA, transmission au cabinet</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportFEC(filterRegion || undefined)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export FEC
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Ajouter une facture
            </button>
          </div>
        </div>

        {/* Modal — nouvelle facture */}
        {createOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              aria-label="Fermer"
              onClick={() => setCreateOpen(false)}
            />
            <div className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Nouvelle facture</h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
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

                {/* Sur mobile : capture="environment" ouvre la caméra. Sur PC : ouvre le sélecteur de fichiers images */}
                <input ref={cameraInputRef} type="file" accept="image/*" multiple onChange={handleFileInput} className="hidden" />
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf" multiple onChange={handleFileInput} className="hidden" />

                {/* Region */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Région / Pays du cabinet</label>
                  <div className="grid grid-cols-4 gap-2">
                    {regionOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setRegion(opt.value)}
                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-medium transition ${
                          region === opt.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"
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
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Montant TTC (€) <span className="text-xs text-slate-400">— détecté auto par OCR</span>
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
                      <p className="text-sm font-medium text-slate-800">{files.length} fichier(s)</p>
                      <button onClick={handleClearAll} className="text-xs text-slate-400 hover:text-rose-600">Tout effacer</button>
                    </div>
                    <ul className="space-y-2">
                      {files.map((file, i) => (
                        <li key={`${file.name}-${i}`} className="flex items-center justify-between text-sm text-slate-700">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                              {file.type.includes("pdf") ? "PDF" : "IMG"}
                            </span>
                            <span className="truncate flex-1">{file.name}</span>
                            {uploadedUrls.find((u) => u.name === file.name) && (
                              <span className="text-emerald-600 text-xs shrink-0">☁ cloud</span>
                            )}
                          </div>
                          <button onClick={() => handleDeleteFile(i)} className="text-rose-400 hover:text-rose-600 shrink-0 ml-2">✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ocrStatus && (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                    <p className="text-sm text-blue-800">{ocrStatus}</p>
                  </div>
                )}

                {extractedTexts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Texte extrait (OCR) :</p>
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
          </div>
        )}

        {/* Liste des factures */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                onChange={(e) => { setFilterRegion(e.target.value); loadInvoices(e.target.value || undefined, filterStatus || undefined); }}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
              >
                <option value="">Toutes régions</option>
                {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.flag} {o.label}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); loadInvoices(filterRegion || undefined, e.target.value || undefined); }}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
              >
                <option value="">Tous statuts</option>
                <option value="pending">En attente</option>
                <option value="sent">Envoyé</option>
                <option value="archived">Archivé</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingList ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-sm">Aucune facture enregistrée.</p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">N° Facture</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Client / Fournisseur</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Référence</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right">Montant HT</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right">Montant TTC</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-center">Statut</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => {
                    const montantTTC = inv.montantTTC ?? inv.amount;
                    const montantHT  = inv.montantHT;
                    const dateLabel  = inv.createdAt
                      ? new Date(inv.createdAt).toLocaleDateString("fr-FR")
                      : "—";
                    const flag = regionOptions.find((r) => r.value === inv.region)?.flag ?? "🌍";

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        {/* N° Facture */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{flag}</span>
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {inv.numeroFacture ?? <span className="text-slate-300 font-normal italic">—</span>}
                            </span>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                          {dateLabel}
                        </td>

                        {/* Client / Fournisseur */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {inv.fournisseur ?? (
                              <span className="text-slate-400 font-normal italic text-xs">
                                {inv.originalName}
                              </span>
                            )}
                          </p>
                          {inv.category && (
                            <p className="truncate text-xs text-slate-400">{inv.category}</p>
                          )}
                        </td>

                        {/* Référence fichier */}
                        <td className="px-4 py-3 max-w-[160px]">
                          <p className="truncate text-xs text-slate-500">{inv.originalName}</p>
                          {inv.accountant_email && (
                            <p className="truncate text-xs text-slate-400">→ {inv.accountant_email}</p>
                          )}
                        </td>

                        {/* Montant HT */}
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-sm text-slate-700">
                          {montantHT != null
                            ? <span>{montantHT.toFixed(2)} <span className="text-xs text-slate-400">€</span></span>
                            : <span className="text-slate-300">—</span>}
                        </td>

                        {/* Montant TTC */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {montantTTC != null
                            ? <span className="font-mono font-semibold text-slate-900">{montantTTC.toFixed(2)} <span className="text-xs text-slate-400">€</span></span>
                            : <span className="text-slate-300 font-mono">—</span>}
                        </td>

                        {/* Statut */}
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            inv.status === "sent"     ? "bg-emerald-100 text-emerald-700"
                            : inv.status === "archived" ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {inv.status === "sent" ? "Envoyé" : inv.status === "archived" ? "Archivé" : "En attente"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Bouton PDF / document */}
                            {inv.fileUrl ? (
                              <a
                                href={inv.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Voir le document"
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 transition"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                PDF
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-300">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                PDF
                              </span>
                            )}

                                 {/* Extraction IA */}
                                 <div className="flex flex-col items-center gap-0.5">
                                   <button
                                     onClick={() => handleExtract(inv.id)}
                                     disabled={extractingId === inv.id}
                                     title="Extraction comptable IA"
                                     className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs transition disabled:opacity-40 ${
                                       extractResults[inv.id]
                                         ? extractResults[inv.id].ok
                                           ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                           : "border-rose-200 bg-rose-50 text-rose-700"
                                         : "border-slate-200 text-slate-600 hover:bg-slate-100"
                                     }`}
                                   >
                                     {extractingId === inv.id ? (
                                       <span className="flex items-center gap-1">
                                         <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z"/>
                                         </svg>
                                         IA…
                                       </span>
                                     ) : "⚡ IA"}
                                   </button>
                                   {extractResults[inv.id]?.msg && (
                                     <span className={`max-w-[120px] truncate text-[10px] leading-tight ${
                                       extractResults[inv.id].ok ? "text-emerald-600" : "text-rose-600"
                                     }`} title={extractResults[inv.id].msg}>
                                       {extractResults[inv.id].msg}
                                     </span>
                                   )}
                                 </div>

                            {/* Partage */}
                            <button
                              onClick={() => handleShare(inv.id)}
                              disabled={sharingId === inv.id}
                              title={shareLinks[inv.id] ? "Lien partagé — cliquer pour copier" : "Générer un lien de partage"}
                              className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs transition disabled:opacity-40 ${
                                shareLinks[inv.id]
                                  ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {sharingId === inv.id ? "…" : "🔗"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
