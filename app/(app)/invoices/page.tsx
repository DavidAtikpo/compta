"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import Tesseract from "tesseract.js";
import { MAX_PDF_INVOICES } from "../../../lib/pdf-export";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
];

/** Réglages IMAP Gmail recommandés (identiques pour tous les comptes Gmail). */
const IMAP_DEFAULT_HOST = "imap.gmail.com";
const IMAP_DEFAULT_PORT = "993";

/** Pays / zones pour rattacher les factures importées (valeur stockée en base). */
const IMAP_COUNTRY_GROUPS: { groupName: string; options: { value: string; label: string }[] }[] = [
  {
    groupName: "Europe",
    options: [
      { value: "france", label: "🇫🇷 France" },
      { value: "belgique", label: "🇧🇪 Belgique" },
      { value: "suisse", label: "🇨🇭 Suisse" },
      { value: "luxembourg", label: "🇱🇺 Luxembourg" },
      { value: "allemagne", label: "🇩🇪 Allemagne" },
      { value: "espagne", label: "🇪🇸 Espagne" },
      { value: "italie", label: "🇮🇹 Italie" },
      { value: "portugal", label: "🇵🇹 Portugal" },
      { value: "pays_bas", label: "🇳🇱 Pays-Bas" },
      { value: "autriche", label: "🇦🇹 Autriche" },
      { value: "pologne", label: "🇵🇱 Pologne" },
      { value: "roumanie", label: "🇷🇴 Roumanie" },
      { value: "grece", label: "🇬🇷 Grèce" },
      { value: "irlande", label: "🇮🇪 Irlande" },
      { value: "royaume_uni", label: "🇬🇧 Royaume-Uni" },
      { value: "suede", label: "🇸🇪 Suède" },
      { value: "norvege", label: "🇳🇴 Norvège" },
      { value: "danemark", label: "🇩🇰 Danemark" },
      { value: "finlande", label: "🇫🇮 Finlande" },
      { value: "republique_tcheque", label: "🇨🇿 République tchèque" },
      { value: "hongrie", label: "🇭🇺 Hongrie" },
      { value: "croatie", label: "🇭🇷 Croatie" },
    ],
  },
  {
    groupName: "Afrique",
    options: [
      { value: "maroc", label: "🇲🇦 Maroc" },
      { value: "algerie", label: "🇩🇿 Algérie" },
      { value: "tunisie", label: "🇹🇳 Tunisie" },
      { value: "senegal", label: "🇸🇳 Sénégal" },
      { value: "cote_ivoire", label: "🇨🇮 Côte d'Ivoire" },
      { value: "cameroun", label: "🇨🇲 Cameroun" },
      { value: "togo", label: "🇹🇬 Togo" },
      { value: "benin", label: "🇧🇯 Bénin" },
      { value: "mali", label: "🇲🇱 Mali" },
      { value: "burkina", label: "🇧🇫 Burkina Faso" },
      { value: "nigeria", label: "🇳🇬 Nigeria" },
      { value: "kenya", label: "🇰🇪 Kenya" },
      { value: "afrique_sud", label: "🇿🇦 Afrique du Sud" },
      { value: "egypte", label: "🇪🇬 Égypte" },
    ],
  },
  {
    groupName: "Amériques",
    options: [
      { value: "canada", label: "🇨🇦 Canada" },
      { value: "usa", label: "🇺🇸 États-Unis" },
      { value: "mexique", label: "🇲🇽 Mexique" },
      { value: "bresil", label: "🇧🇷 Brésil" },
      { value: "argentine", label: "🇦🇷 Argentine" },
      { value: "chili", label: "🇨🇱 Chili" },
      { value: "colombie", label: "🇨🇴 Colombie" },
      { value: "perou", label: "🇵🇪 Pérou" },
    ],
  },
  {
    groupName: "Asie & Océanie",
    options: [
      { value: "vietnam", label: "🇻🇳 Vietnam" },
      { value: "chine", label: "🇨🇳 Chine" },
      { value: "japon", label: "🇯🇵 Japon" },
      { value: "coree_sud", label: "🇰🇷 Corée du Sud" },
      { value: "inde", label: "🇮🇳 Inde" },
      { value: "singapour", label: "🇸🇬 Singapour" },
      { value: "thailande", label: "🇹🇭 Thaïlande" },
      { value: "indonesie", label: "🇮🇩 Indonésie" },
      { value: "philippines", label: "🇵🇭 Philippines" },
      { value: "australie", label: "🇦🇺 Australie" },
      { value: "nouvelle_zelande", label: "🇳🇿 Nouvelle-Zélande" },
    ],
  },
  {
    groupName: "Moyen-Orient",
    options: [
      { value: "emirats", label: "🇦🇪 Émirats arabes unis" },
      { value: "arabie_saoudite", label: "🇸🇦 Arabie saoudite" },
      { value: "israel", label: "🇮🇱 Israël" },
      { value: "turquie", label: "🇹🇷 Turquie" },
      { value: "qatar", label: "🇶🇦 Qatar" },
    ],
  },
  {
    groupName: "Autre",
    options: [{ value: "autre", label: "🌍 Autre / non listé" }],
  },
];

const IMAP_REGION_OPTIONS_FLAT = IMAP_COUNTRY_GROUPS.flatMap((g) => g.options);

const IMAP_REGION_OPTIONS_SORTED = [...IMAP_REGION_OPTIONS_FLAT].sort((a, b) =>
  a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
);

function regionDisplayLabel(regionValue: string): string {
  return (
    IMAP_REGION_OPTIONS_FLAT.find((o) => o.value === regionValue)?.label ??
    regionOptions.find((r) => r.value === regionValue)?.label ??
    regionValue
  );
}

/** Filtre pays : insensible à la casse et aux accents ; cherche dans le libellé et le code (ex. pays_bas). */
function imapCountryFilterMatch(query: string, label: string, value: string): boolean {
  const q = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!q) return true;
  const hay = `${label} ${value.replace(/_/g, " ")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return hay.includes(q);
}

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
  tauxTVA: number | null;
  invoiceDate: string | null;
}

function extractPaidAmount(ocrText: string | null): number | null {
  if (!ocrText) return null;
  const aiMarkers = [...ocrText.matchAll(/\[AI_PAID_AMOUNT\]\s*=\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)];
  if (aiMarkers.length > 0) {
    const last = aiMarkers[aiMarkers.length - 1]?.[1];
    if (last) {
      const amount = Number(last.replace(",", "."));
      if (!Number.isNaN(amount)) return amount;
    }
  }
  const normalized = ocrText.replace(/\s+/g, " ");
  const patterns = [
    /montant\s+pay[ée]\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /total\s+pay[ée]\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /paid\s+amount\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /amount\s+paid\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /total\s+paid\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /paid\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const amount = Number(match[1].replace(",", "."));
      if (!Number.isNaN(amount)) return amount;
    }
  }
  return null;
}

type Tab = "invoices" | "email";

/** Largeur minimale du menu actions (aligné avec min-w-[11rem]) */
const ACTION_MENU_WIDTH_PX = 176;

export default function InvoicesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("invoices");

  // Upload / OCR states
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

  // Invoice list states
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Action states
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractResults, setExtractResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [actionMenuPlacement, setActionMenuPlacement] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Aperçu document");
  /** Aperçu brouillon Cloudinary : image (balise img), PDF (iframe). */
  const [previewImageMode, setPreviewImageMode] = useState(false);
  /** Upload Cloudinary (OCR + envoi) en cours pour les fichiers du modal nouvelle facture */
  const [draftUploading, setDraftUploading] = useState(false);

  // Email import states
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState("993");
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [imapRegion, setImapRegion] = useState("france");
  const [imapImporting, setImapImporting] = useState(false);
  const [imapResult, setImapResult] = useState<{ emailsFound?: number; imported?: number; errors?: string[]; error?: string } | null>(null);
  const [imapEditingServer, setImapEditingServer] = useState(false);
  const [imapShowPassword, setImapShowPassword] = useState(false);
  const [imapCountryFilter, setImapCountryFilter] = useState("");
  const [createCountryFilter, setCreateCountryFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const selectAllHeaderRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("compta-token");
    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken);
    }
    loadInvoices();
    // Pre-fill IMAP from env/settings if available
    const savedImapUser = window.localStorage.getItem("imap-user");
    if (savedImapUser) setImapUser(savedImapUser);
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    setCreateCountryFilter("");
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  useEffect(() => {
    if (!openActionMenuId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-invoice-action-menu]")) setOpenActionMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenActionMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [openActionMenuId]);

  useLayoutEffect(() => {
    if (!openActionMenuId) {
      setActionMenuPlacement(null);
      return;
    }
    const btn = document.querySelector(
      `[data-invoice-menu-button="${openActionMenuId}"]`
    ) as HTMLButtonElement | null;
    if (!btn) {
      setActionMenuPlacement(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    let left = r.right - ACTION_MENU_WIDTH_PX;
    left = Math.max(8, Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - 8));
    setActionMenuPlacement({ top: r.bottom + 4, left });
  }, [openActionMenuId, invoices]);

  useEffect(() => {
    if (!openActionMenuId) return;
    const reposition = () => {
      const btn = document.querySelector(
        `[data-invoice-menu-button="${openActionMenuId}"]`
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      let left = r.right - ACTION_MENU_WIDTH_PX;
      left = Math.max(8, Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - 8));
      setActionMenuPlacement({ top: r.bottom + 4, left });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [openActionMenuId]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => invoices.some((i) => i.id === id)));
  }, [invoices]);

  useEffect(() => {
    const el = selectAllHeaderRef.current;
    if (!el) return;
    const all =
      invoices.length > 0 && invoices.every((i) => selectedIds.includes(i.id));
    el.indeterminate = selectedIds.length > 0 && !all;
  }, [selectedIds, invoices]);

  const fetchMe = async (t: string) => {
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (data.email) setUserEmail(data.email);
    } catch { /* silent */ }
  };

  const loadInvoices = async (reg?: string, status?: string, categ?: string, dateFrom?: string, dateTo?: string) => {
    setLoadingList(true);
    try {
      let url = "/api/invoices?limit=200";
      if (reg) url += `&region=${reg}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url);
      if (res.ok) {
        let data: Invoice[] = await res.json();
        // Client-side filters for category and date
        if (categ) data = data.filter((inv) => inv.category === categ);
        if (dateFrom) {
          const from = new Date(dateFrom);
          data = data.filter((inv) => {
            const d = inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(inv.createdAt);
            return d >= from;
          });
        }
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          data = data.filter((inv) => {
            const d = inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(inv.createdAt);
            return d <= to;
          });
        }
        setInvoices(data);
        const links: Record<string, string> = {};
        data.forEach((inv) => {
          if (inv.shareToken) links[inv.id] = `${window.location.origin}/share/${inv.shareToken}`;
        });
        setShareLinks(links);
      }
    } catch (err) {
      console.error("Erreur chargement factures:", err);
    } finally {
      setLoadingList(false);
    }
  };

  const applyFilters = (overrides: Partial<{ reg: string; status: string; categ: string; dateFrom: string; dateTo: string }> = {}) => {
    const reg = overrides.reg ?? filterRegion;
    const status = overrides.status ?? filterStatus;
    const categ = overrides.categ ?? filterCategory;
    const dateFrom = overrides.dateFrom ?? filterDateFrom;
    const dateTo = overrides.dateTo ?? filterDateTo;
    loadInvoices(reg || undefined, status || undefined, categ || undefined, dateFrom || undefined, dateTo || undefined);
  };

  const clearFilters = () => {
    setFilterRegion("");
    setFilterStatus("");
    setFilterCategory("");
    setFilterDateFrom("");
    setFilterDateTo("");
    loadInvoices();
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
      if (!res.ok) return { error: data.error || `Erreur ${res.status}` };
      if (!data.url) return { error: "URL manquante dans la réponse Cloudinary" };
      return { url: data.url };
    } catch (e) {
      return { error: (e as Error).message || "Erreur réseau" };
    }
  };

  const handleFiles = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const validFiles = newFiles.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    const rejected = newFiles.filter((f) => !f.type.startsWith("image/") && f.type !== "application/pdf");
    if (validFiles.length === 0) {
      setUploadResult(`Fichiers non supportés : ${rejected.map((f) => f.name).join(", ")}. Acceptés : images et PDF.`);
      return;
    }
    setDraftUploading(true);
    try {
      setFiles((prev) => [...prev, ...validFiles]);
      setUploadResult("");
      setSendResult("");
      setOcrStatus("Traitement en cours…");
      const imageFiles = validFiles.filter((f) => f.type.startsWith("image/"));
      const pdfFiles = validFiles.filter((f) => f.type === "application/pdf");
      if (imageFiles.length > 0) {
        const texts = await runOcr(imageFiles);
        setExtractedTexts((prev) => [...prev, ...texts]);
        setOcrStatus(`OCR terminé — ${texts.length} image(s) analysée(s).`);
      }
      if (pdfFiles.length > 0) {
        setOcrStatus((s) => `${s} ${pdfFiles.length} PDF(s) prêt(s) — texte extrait via IA après enregistrement.`);
      }
      setOcrStatus((s) => `${s} Enregistrement sur Cloudinary…`);
      const urls: { name: string; url: string }[] = [];
      const uploadErrors: string[] = [];
      for (const file of validFiles) {
        const result = await uploadToCloudinary(file);
        if ("url" in result) urls.push({ name: file.name, url: result.url });
        else {
          uploadErrors.push(`${file.name} : ${result.error}`);
          console.error("Upload Cloudinary échoué:", file.name, result.error);
        }
      }
      setUploadedUrls((prev) => [...prev, ...urls]);
      if (uploadErrors.length > 0) {
        setUploadResult(`⚠️ Erreur upload Cloudinary : ${uploadErrors.join(" | ")}`);
        setOcrStatus(`${urls.length}/${validFiles.length} fichier(s) sur Cloudinary. Corrigez ou retirez les fichiers en erreur.`);
      } else {
        setOcrStatus(`✓ ${urls.length} pièce(s) enregistrée(s) sur Cloudinary — vous pouvez prévisualiser, télécharger ou envoyer au cabinet.`);
      }
    } finally {
      setDraftUploading(false);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
    // Permet de reprendre une photo / le même fichier sur mobile
    e.target.value = "";
  };

  const handleSaveInvoices = async () => {
    if (files.length === 0) {
      setUploadResult("Aucun fichier à enregistrer.");
      return;
    }
    const missing = files.filter((f) => !uploadedUrls.some((u) => u.name === f.name));
    if (missing.length > 0) {
      setUploadResult(
        `Chaque pièce doit d’abord être sur Cloudinary. ${missing.length} fichier(s) sans URL : supprimez-les ou attendez la fin de l’upload.`,
      );
      return;
    }
    setUploading(true);
    setUploadResult("");
    let autoExtractOk = 0;
    let autoExtractFail = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ocrText = extractedTexts[i]?.text || null;
        const fileUrl = uploadedUrls.find((u) => u.name === file.name)?.url || null;
        setOcrStatus(`Enregistrement ${i + 1}/${files.length} : ${file.name}`);
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
          if (fileUrl && inv.id) {
            setOcrStatus(`Extraction IA ${i + 1}/${files.length} : ${file.name}`);
            try {
              const exRes = await fetch(`/api/invoices/${inv.id}/extract`, { method: "POST" });
              if (exRes.ok) autoExtractOk++;
              else autoExtractFail++;
            } catch { autoExtractFail++; }
          }
        }
      }
      const totalExtract = autoExtractOk + autoExtractFail;
      if (totalExtract > 0) {
        setUploadResult(
          `${files.length} facture(s) enregistrée(s). Extraction IA auto : ${autoExtractOk} OK${autoExtractFail ? `, ${autoExtractFail} en erreur (relancer depuis le menu)` : ""}.`
        );
      } else {
        setUploadResult(`${files.length} facture(s) enregistrée(s).`);
      }
      setOcrStatus("Traitement terminé.");
      await loadInvoices(filterRegion || undefined, filterStatus || undefined, filterCategory || undefined, filterDateFrom || undefined, filterDateTo || undefined);
      handleClearAll();
      setCreateOpen(false);
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
    const missing = files.filter((f) => !uploadedUrls.some((u) => u.name === f.name));
    if (missing.length > 0) {
      setSendResult("Toutes les pièces doivent être uploadées sur Cloudinary avant l’envoi au cabinet.");
      return;
    }
    setSending(true);
    setSendResult("");
    const formData = new FormData();
    formData.append("region", region);
    formData.append("message", message || `Transmission de ${files.length} pièce(s).\nRégion : ${region}`);
    formData.append("senderName", userEmail || "Utilisateur Compta IA");
    files.forEach((file) => formData.append("files", file));
    try {
      const res = await fetch("/api/send-to-accountant", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) setSendResult(data.error || "Erreur lors de l'envoi.");
      else {
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
        if (d.fournisseur)   parts.push(d.fournisseur);
        if (d.montantTTC)    parts.push(`TTC: ${Number(d.montantTTC).toFixed(2)} €`);
        if (d.montantHT)     parts.push(`HT: ${Number(d.montantHT).toFixed(2)} €`);
        if (d.numeroFacture) parts.push(`N°${d.numeroFacture}`);
        const msg = parts.length > 0 ? `✓ ${parts.join(" · ")}` : "✓ Extrait (aucune donnée trouvée)";
        setExtractResults((prev) => ({ ...prev, [id]: { ok: true, msg } }));
        await loadInvoices(filterRegion || undefined, filterStatus || undefined, filterCategory || undefined, filterDateFrom || undefined, filterDateTo || undefined);
      } else {
        setExtractResults((prev) => ({ ...prev, [id]: { ok: false, msg: `✗ ${json.error || `Erreur ${res.status}`}` } }));
      }
    } catch {
      setExtractResults((prev) => ({ ...prev, [id]: { ok: false, msg: "✗ Erreur réseau" } }));
    } finally {
      setExtractingId(null);
      setTimeout(() => setExtractResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 6000);
    }
  };

  const fetchInvoiceFileBlob = async (inv: Invoice): Promise<Blob | null> => {
    const t = token ?? (typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null);
    if (!t) return null;
    try {
      const fileRes = await fetch(`/api/invoices/${inv.id}/file`, { headers: { Authorization: `Bearer ${t}` } });
      const contentType = fileRes.headers.get("content-type") || "";
      if (fileRes.ok && contentType.includes("application/json")) {
        const data = await fileRes.json().catch(() => ({}));
        if (typeof data.url !== "string") return null;
        const remote = await fetch(data.url);
        if (!remote.ok) return null;
        return await remote.blob();
      }
      if (fileRes.ok) return await fileRes.blob();
      return null;
    } catch {
      return null;
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer ${ids.length} facture(s) ? Cette action est irréversible.`)) return;
    setBulkDeleting(true);
    setMessage("");
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
          return { id, ok: res.ok };
        })
      );
      const removed = results.filter((r) => r.ok).map((r) => r.id);
      setInvoices((prev) => prev.filter((i) => !removed.includes(i.id)));
      setSelectedIds([]);
      setMessage(`${removed.length} facture(s) supprimée(s).`);
    } catch {
      setMessage("Erreur lors de la suppression groupée.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkSend = async () => {
    const t = token ?? (typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null);
    if (!t) {
      setMessage("Connectez-vous pour envoyer au cabinet.");
      return;
    }
    const selected = invoices.filter((i) => selectedIds.includes(i.id));
    const withFiles = selected.filter((i) => i.fileUrl);
    if (withFiles.length === 0) {
      setMessage("Aucun fichier pour les factures sélectionnées.");
      return;
    }

    const byRegion = new Map<string, Invoice[]>();
    for (const inv of withFiles) {
      const list = byRegion.get(inv.region) ?? [];
      list.push(inv);
      byRegion.set(inv.region, list);
    }

    setBulkSending(true);
    setMessage("");
    try {
      const parts: string[] = [];
      for (const [region, list] of byRegion) {
        const formData = new FormData();
        formData.append("region", region);
        formData.append("senderName", userEmail || "Utilisateur Compta IA");
        formData.append(
          "message",
          `Transmission groupée de ${list.length} facture(s).\nRégion : ${region}`
        );
        let attached = 0;
        for (const inv of list) {
          const blob = await fetchInvoiceFileBlob(inv);
          if (!blob || blob.size === 0) continue;
          formData.append("invoiceIds", inv.id);
          formData.append(
            "files",
            new File([blob], inv.originalName || "facture.pdf", {
              type: blob.type || "application/pdf",
            })
          );
          attached++;
        }
        if (attached === 0) {
          parts.push(`${region}: aucun fichier récupéré`);
          continue;
        }
        const sendRes = await fetch("/api/send-to-accountant", {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
          body: formData,
        });
        const sendJson = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          parts.push(`${region}: ${sendJson.error || "erreur"}`);
        } else {
          parts.push(`${region}: ${sendJson.message || "OK"}`);
        }
      }
      setSelectedIds([]);
      await loadInvoices(
        filterRegion || undefined,
        filterStatus || undefined,
        filterCategory || undefined,
        filterDateFrom || undefined,
        filterDateTo || undefined
      );
      setMessage(parts.join(" · "));
    } catch {
      setMessage("Erreur réseau lors de l'envoi groupé.");
    } finally {
      setBulkSending(false);
    }
  };

  const handleDelete = async (inv: Invoice) => {
    if (!window.confirm(`Supprimer la facture "${inv.fournisseur ?? inv.originalName}" ?\nCette action est irréversible.`)) return;
    setDeletingId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
      if (res.ok) {
        setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
        setSelectedIds((prev) => prev.filter((id) => id !== inv.id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Erreur lors de la suppression.");
      }
    } catch {
      alert("Erreur réseau lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendSingleInvoice = async (inv: Invoice) => {
    const t = token ?? (typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null);
    if (!t) { setMessage("Connectez-vous pour envoyer la facture."); return; }
    setSendingInvoiceId(inv.id);
    setMessage("");
    try {
      const fileBlob = await fetchInvoiceFileBlob(inv);
      if (!fileBlob) {
        setMessage("Impossible de récupérer le fichier.");
        return;
      }
      if (fileBlob.size === 0) { setMessage("Fichier vide ou inaccessible."); return; }
      const formData = new FormData();
      formData.append("region", inv.region);
      formData.append("senderName", userEmail || "Utilisateur Compta IA");
      formData.append("message", `Transmission facture ${inv.numeroFacture ?? inv.originalName}.\nRégion : ${inv.region}`);
      formData.append("invoiceIds", inv.id);
      formData.append("files", new File([fileBlob], inv.originalName || "facture.pdf", { type: fileBlob.type || "application/pdf" }));
      const sendRes = await fetch("/api/send-to-accountant", {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: formData,
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) { setMessage(sendJson.error || "Erreur lors de l'envoi au cabinet."); return; }
      setMessage(sendJson.message || "Facture envoyée au cabinet.");
      await loadInvoices(filterRegion || undefined, filterStatus || undefined, filterCategory || undefined, filterDateFrom || undefined, filterDateTo || undefined);
    } catch {
      setMessage("Erreur réseau lors de l'envoi.");
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const openInvoiceDocument = async (invId: string) => {
    const t = token ?? (typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null);
    if (!t) { setMessage("Connectez-vous pour télécharger le document."); return; }
    try {
      const res = await fetch(`/api/invoices/${invId}/file`, { headers: { Authorization: `Bearer ${t}` } });
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.url === "string") {
          const a = document.createElement("a");
          a.href = data.url; a.download = ""; a.rel = "noopener noreferrer";
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          return;
        }
        setMessage(typeof data.error === "string" ? data.error : "Téléchargement impossible.");
        return;
      }
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = "document.pdf";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return;
      }
      const err = await res.json().catch(() => ({}));
      setMessage(typeof err.error === "string" ? err.error : "Téléchargement impossible.");
    } catch {
      setMessage("Erreur réseau lors du téléchargement.");
    }
  };

  const closeDocumentPreview = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewOpen(false);
    setPreviewUrl(null);
    setPreviewImageMode(false);
  };

  const openDraftCloudinaryPreview = (url: string, title: string, isImage: boolean) => {
    setPreviewTitle(title);
    setPreviewUrl(url);
    setPreviewImageMode(isImage);
    setPreviewOpen(true);
  };

  const downloadDraftFromCloudinary = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "piece";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const previewInvoiceDocument = async (invId: string, title: string) => {
    setPreviewImageMode(false);
    const t = token ?? (typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null);
    if (!t) { setMessage("Connectez-vous pour voir le document."); return; }
    try {
      const res = await fetch(`/api/invoices/${invId}/file?disposition=inline`, { headers: { Authorization: `Bearer ${t}` } });
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.url === "string") {
          setPreviewTitle(title); setPreviewUrl(data.url); setPreviewOpen(true);
          return;
        }
        setMessage(typeof data.error === "string" ? data.error : "Aperçu impossible.");
        return;
      }
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewTitle(title); setPreviewUrl(blobUrl); setPreviewOpen(true);
        return;
      }
      const err = await res.json().catch(() => ({}));
      setMessage(typeof err.error === "string" ? err.error : "Aperçu impossible.");
    } catch {
      setMessage("Erreur réseau lors de l'aperçu.");
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
    setFiles([]); setExtractedTexts([]); setUploadedUrls([]);
    setOcrStatus(""); setUploadResult(""); setSendResult("");
    setAmount(""); setCategory(""); setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const exportPDF = async () => {
    if (selectedIds.length === 0) {
      setMessage("Cochez au moins une facture dans le tableau, puis cliquez sur Export PDF.");
      return;
    }
    if (selectedIds.length > MAX_PDF_INVOICES) {
      setMessage(
        `Export PDF : maximum ${MAX_PDF_INVOICES} factures à la fois (${selectedIds.length} sélectionnées). Désélectionnez-en une partie ou exportez en plusieurs fois.`,
      );
      return;
    }
    setExportingPdf(true);
    setMessage("");
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(typeof err.error === "string" ? err.error : `Export PDF impossible (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const name = m?.[1] ?? `factures_selection_${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(`PDF téléchargé (${selectedIds.length} facture(s)).`);
    } catch (e) {
      setMessage(`Export PDF : ${(e as Error).message || "erreur réseau"}`);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleImapImport = async () => {
    setImapImporting(true);
    setImapResult(null);
    if (imapUser) window.localStorage.setItem("imap-user", imapUser);
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
      const data = await res.json().catch(() => ({}));
      setImapResult(data);
      if (res.ok && (data.imported ?? 0) > 0) {
        await loadInvoices(filterRegion || undefined, filterStatus || undefined, filterCategory || undefined, filterDateFrom || undefined, filterDateTo || undefined);
        setActiveTab("invoices");
      }
    } catch (e) {
      setImapResult({ error: (e as Error).message || "Erreur réseau" });
    } finally {
      setImapImporting(false);
    }
  };

  const hasActiveFilters = filterRegion || filterStatus || filterCategory || filterDateFrom || filterDateTo;

  const allVisibleSelected =
    invoices.length > 0 && invoices.every((i) => selectedIds.includes(i.id));

  const actionMenuInvoice = openActionMenuId
    ? invoices.find((i) => i.id === openActionMenuId)
    : undefined;

  const draftAllOnCloudinary =
    files.length > 0 && files.every((f) => uploadedUrls.some((u) => u.name === f.name));

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8">
      {/* Document preview modal — plein écran */}
      {previewOpen && previewUrl && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/80">
          <div className="flex h-full w-full flex-col overflow-hidden bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2">
              <p className="truncate text-xs font-medium text-slate-800">{previewTitle}</p>
              <button
                type="button"
                onClick={closeDocumentPreview}
                className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                Fermer
              </button>
            </div>
            {previewImageMode ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-2">
                <img src={previewUrl} alt={previewTitle} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <iframe src={previewUrl} title="Aperçu document" className="min-h-0 flex-1 w-full border-0" />
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-none min-w-0 space-y-3">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Factures et pièces justificatives</h1>
            <p className="mt-0.5 text-xs text-slate-500">OCR, extraction IA, stockage, transmission cabinet</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => void exportPDF()}
              disabled={exportingPdf || selectedIds.length === 0}
              title={`Exporte uniquement les lignes cochées (max. ${MAX_PDF_INVOICES}).`}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingPdf ? "PDF…" : "Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Ajouter une facture
            </button>
          </div>
        </div>

        {message && (
          <div className={`border-b border-slate-200 pb-2 text-xs ${message.includes("Erreur") || message.includes("impossible") || message.includes("vide") ? "text-slate-800" : "text-slate-700"}`}>
            {message}
            <button type="button" onClick={() => setMessage("")} className="ml-2 text-slate-500 hover:text-slate-900">Fermer</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 border-b-2 px-3 py-2 text-xs font-medium transition ${activeTab === "invoices" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            Factures
            {invoices.length > 0 && (
              <span className="ml-1.5 rounded bg-slate-200 px-1 py-0 text-[10px] font-semibold text-slate-700">
                {invoices.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`flex-1 border-b-2 px-3 py-2 text-xs font-medium transition ${activeTab === "email" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            Import email (IMAP)
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB: FACTURES */}
        {/* ============================================================ */}
        {activeTab === "invoices" && (
          <div className="w-full min-w-0">
            {/* Filters bar */}
            <div className="border-b border-slate-200 py-2">
              <div className="flex flex-wrap items-end gap-2">
                {/* Region */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Région</label>
                  <select
                    value={filterRegion}
                    onChange={(e) => { setFilterRegion(e.target.value); applyFilters({ reg: e.target.value }); }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Toutes</option>
                    {IMAP_REGION_OPTIONS_SORTED.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Statut</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value); applyFilters({ status: e.target.value }); }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Tous</option>
                    <option value="pending">En attente</option>
                    <option value="sent">Envoyé</option>
                    <option value="archived">Archivé</option>
                  </select>
                </div>

                {/* Category */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Catégorie</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => { setFilterCategory(e.target.value); applyFilters({ categ: e.target.value }); }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Toutes</option>
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Date from */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Date facture du</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => { setFilterDateFrom(e.target.value); applyFilters({ dateFrom: e.target.value }); }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                {/* Date to */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">au</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => { setFilterDateTo(e.target.value); applyFilters({ dateTo: e.target.value }); }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="self-end rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-2 text-[11px]">
                <span className="font-medium text-slate-700">
                  {selectedIds.length} sélectionné(s)
                </span>
                <button
                  type="button"
                  disabled={bulkSending}
                  onClick={() => void handleBulkSend()}
                  className="rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {bulkSending ? "Envoi…" : "Envoyer au cabinet"}
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => void handleBulkDelete()}
                  className="rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {bulkDeleting ? "Suppression…" : "Supprimer"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-slate-500 underline hover:text-slate-800"
                >
                  Tout désélectionner
                </button>
                <span className="text-slate-400">
                  Export PDF (en-tête) : cette sélection, max. {MAX_PDF_INVOICES} / fichier.
                </span>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              {loadingList ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-slate-100 animate-pulse" />)}
                </div>
              ) : invoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-xs font-medium text-slate-600">Aucune facture trouvée</p>
                  <p className="mt-1 text-[11px] text-slate-500">{hasActiveFilters ? "Modifiez les filtres ou " : ""}ajoutez une facture ou importez depuis votre email.</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("email")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Import email
                    </button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left">
                      <th className="w-8 px-1 py-2 text-center">
                        <input
                          ref={selectAllHeaderRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(invoices.map((i) => i.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          aria-label="Tout sélectionner"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                        />
                      </th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">N° Facture</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap" title="Date d'ajout">Ajout</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap" title="Date sur la facture (IA)">Date facture</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Client / Fournisseur</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Référence</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right">Montant HT</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-center">Règlé</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right">Montant TTC</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-center">Statut</th>
                      <th className="px-1 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right w-12">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => {
                      const montantTTC = inv.montantTTC ?? inv.amount;
                      const montantHT  = inv.montantHT;
                      const paidAmount = extractPaidAmount(inv.ocrText);
                      const dateAjout  = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("fr-FR") : "—";
                      const dateFacture = inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("fr-FR") : "—";
                      const regionLabel = regionDisplayLabel(inv.region);
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="w-8 px-1 py-1.5 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(inv.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedIds((prev) =>
                                  e.target.checked
                                    ? [...prev, inv.id]
                                    : prev.filter((x) => x !== inv.id)
                                );
                              }}
                              aria-label={`Sélectionner ${inv.originalName}`}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex flex-col gap-0">
                              <span className="font-mono text-[11px] font-semibold text-slate-800">
                                {inv.numeroFacture ?? <span className="text-slate-300 font-normal italic">—</span>}
                              </span>
                              <span className="text-[10px] text-slate-400">{regionLabel}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{dateAjout}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{dateFacture}</td>
                          <td className="px-2 py-1.5 max-w-[140px]">
                            <p className="truncate text-[11px] font-medium text-slate-900">
                              {inv.fournisseur ?? <span className="text-slate-400 font-normal italic">{inv.originalName}</span>}
                            </p>
                            {inv.category && <p className="truncate text-[10px] text-slate-400">{inv.category}</p>}
                          </td>
                          <td className="px-2 py-1.5 max-w-[120px]">
                            <p className="truncate text-[10px] text-slate-500">{inv.originalName}</p>
                            {inv.accountant_email && <p className="truncate text-[10px] text-slate-400">{inv.accountant_email}</p>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-right font-mono text-[11px] text-slate-700">
                            {montantHT != null ? <span>{montantHT.toFixed(2)} <span className="text-[10px] text-slate-400">€</span></span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">
                            {paidAmount != null ? (
                              <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Oui {paidAmount.toFixed(2)} €</span>
                            ) : (
                              <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-right">
                            {montantTTC != null
                              ? <span className="font-mono font-medium text-slate-900">{montantTTC.toFixed(2)} <span className="text-[10px] text-slate-400">€</span></span>
                              : <span className="text-slate-300 font-mono">—</span>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              inv.status === "sent" ? "bg-emerald-100 text-emerald-700"
                              : inv.status === "archived" ? "bg-slate-100 text-slate-600"
                              : "bg-amber-100 text-amber-700"
                            }`}>
                              {inv.status === "sent" ? "Envoyé" : inv.status === "archived" ? "Archivé" : "En attente"}
                            </span>
                          </td>
                          <td className="relative px-1 py-1.5 whitespace-nowrap text-right align-top">
                            <div
                              className="relative inline-flex flex-col items-end gap-0.5"
                              data-invoice-action-menu={inv.id}
                            >
                              <button
                                type="button"
                                data-invoice-menu-button={inv.id}
                                aria-expanded={openActionMenuId === inv.id}
                                aria-haspopup="menu"
                                aria-label="Actions sur la facture"
                                onClick={() =>
                                  setOpenActionMenuId((prev) => (prev === inv.id ? null : inv.id))
                                }
                                className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-0.5 text-base leading-none text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                title="Actions"
                              >
                                ⋮
                              </button>
                              {extractResults[inv.id]?.msg && (
                                <span
                                  className={`max-w-[120px] truncate text-left text-[9px] leading-tight ${
                                    extractResults[inv.id].ok ? "text-slate-600" : "text-slate-700"
                                  }`}
                                  title={extractResults[inv.id].msg}
                                >
                                  {extractResults[inv.id].msg}
                                </span>
                              )}
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
        )}

        {/* ============================================================ */}
        {/* TAB: IMPORT EMAIL */}
        {/* ============================================================ */}
        {activeTab === "email" && (
          <div className="w-full min-w-0 border-t border-slate-200 pt-3">
            <div className="rounded-xl border-2 border-sky-300 bg-gradient-to-b from-sky-50 via-white to-white p-4 shadow-md ring-1 ring-sky-100/80">
              <header className="border-b border-sky-100 pb-3">
                <h2 className="text-base font-bold tracking-tight text-slate-900">Import de factures par email (IMAP)</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Pièces jointes <strong className="text-slate-800">PDF</strong> ou <strong className="text-slate-800">images</strong> des{" "}
                  <strong className="text-slate-900">90 derniers jours</strong>. Serveur et port Gmail sont préconfigurés.
                </p>
              </header>

              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 shadow-sm">
                  <p className="font-semibold text-amber-950">Gmail : mot de passe d&apos;application obligatoire</p>
                  <p className="mt-1 text-[11px] leading-snug text-amber-900/90">
                    Google → Compte → Sécurité → Validation en 2 étapes → Mots de passe des applications.{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-amber-950 underline decoration-2 underline-offset-2 hover:text-amber-800"
                    >
                      Créer un mot de passe
                    </a>
                  </p>
                </div>

                {/* Serveur IMAP : défaut visible, édition au clic */}
                <div className="rounded-lg border-2 border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Connexion IMAP (valeurs par défaut Gmail)
                      </p>
                      {!imapEditingServer ? (
                        <p className="mt-2 break-all font-mono text-sm font-semibold leading-snug text-slate-900 sm:text-base">
                          <span className="text-emerald-700">{imapHost}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span>port </span>
                          <span className="text-emerald-700">{imapPort}</span>
                          <span className="ml-2 inline-block rounded-md bg-emerald-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                            SSL
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">Modifiez uniquement si votre fournisseur impose d&apos;autres paramètres.</p>
                      )}
                    </div>
                    {!imapEditingServer ? (
                      <button
                        type="button"
                        onClick={() => setImapEditingServer(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-white"
                        aria-expanded={false}
                        aria-label="Modifier le serveur IMAP et le port"
                      >
                        <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Modifier
                      </button>
                    ) : (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setImapHost(IMAP_DEFAULT_HOST);
                            setImapPort(IMAP_DEFAULT_PORT);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Rétablir Gmail
                        </button>
                        <button
                          type="button"
                          onClick={() => setImapEditingServer(false)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          Terminer
                        </button>
                      </div>
                    )}
                  </div>
                  {imapEditingServer && (
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-700">Serveur IMAP</label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          placeholder={IMAP_DEFAULT_HOST}
                          className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-700">Port</label>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(e.target.value)}
                          placeholder={IMAP_DEFAULT_PORT}
                          className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-800">Adresse email</label>
                    <input
                      type="email"
                      value={imapUser}
                      onChange={(e) => setImapUser(e.target.value)}
                      placeholder="vous@gmail.com"
                      autoComplete="email"
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-800">Mot de passe d&apos;application</label>
                    <div className="flex gap-2">
                      <input
                        type={imapShowPassword ? "text" : "password"}
                        value={imapPass}
                        onChange={(e) => setImapPass(e.target.value)}
                        placeholder="Saisissez le mot de passe à 16 caractères"
                        autoComplete="current-password"
                        spellCheck={false}
                        className="min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 caret-slate-900 shadow-inner placeholder:font-normal placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        style={{ WebkitTextFillColor: "#0f172a" }}
                      />
                      <button
                        type="button"
                        onClick={() => setImapShowPassword((v) => !v)}
                        className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        {imapShowPassword ? "Masquer" : "Afficher"}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Astuce : « Afficher » permet de vérifier la saisie (ne partagez jamais cet écran).</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-800" htmlFor="imap-country-filter">
                    Pays / région des factures importées
                  </label>
                  <p className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-900">
                    Sélection : {regionDisplayLabel(imapRegion)}
                  </p>
                  <input
                    id="imap-country-filter"
                    type="search"
                    value={imapCountryFilter}
                    onChange={(e) => setImapCountryFilter(e.target.value)}
                    placeholder="Tapez des lettres pour filtrer les pays (ex. bel, maroc, usa…)"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full max-w-2xl rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <ul
                    role="listbox"
                    aria-label="Pays filtrés"
                    className="mt-2 max-h-52 max-w-2xl overflow-y-auto rounded-lg border-2 border-slate-200 bg-white shadow-inner"
                  >
                    {IMAP_REGION_OPTIONS_SORTED.filter((o) =>
                      imapCountryFilterMatch(imapCountryFilter, o.label, o.value),
                    ).map((o) => (
                      <li key={o.value} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={imapRegion === o.value}
                          onClick={() => {
                            setImapRegion(o.value);
                            setImapCountryFilter("");
                          }}
                          className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-slate-100 ${
                            imapRegion === o.value ? "bg-slate-900 font-semibold text-white hover:bg-slate-800" : "text-slate-800"
                          }`}
                        >
                          {o.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {IMAP_REGION_OPTIONS_SORTED.every(
                    (o) => !imapCountryFilterMatch(imapCountryFilter, o.label, o.value),
                  ) && (
                    <p className="mt-1.5 text-[11px] text-amber-800">Aucun pays ne correspond. Essayez un autre mot-clé.</p>
                  )}
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                    Chaque pièce importée sera enregistrée avec ce pays (filtres de la liste, envoi au cabinet).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleImapImport}
                  disabled={imapImporting || !imapUser || !imapPass}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {imapImporting ? "Import en cours (30–60 s)…" : "Lancer l'import email"}
                </button>
              </div>
            </div>

              {imapResult && (
                <div className="space-y-1 border-t border-slate-200 pt-3 text-slate-800">
                  {imapResult.error ? (
                    <p className="text-[11px] font-medium text-slate-900">{imapResult.error}</p>
                  ) : (
                    <>
                      <p className="text-[11px] font-semibold text-slate-900">
                        {imapResult.imported ?? 0} import(s)
                        {typeof imapResult.emailsFound === "number" && ` · ${imapResult.emailsFound} email(s) analysé(s)`}
                      </p>
                      {imapResult.imported === 0 && (
                        <p className="text-[10px] text-slate-600">
                          Aucune pièce jointe pertinente sur 90 jours. Vérifiez les PJ (pas seulement le corps du mail).
                        </p>
                      )}
                      {(imapResult.errors ?? []).length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] font-medium text-slate-800">{imapResult.errors!.length} erreur(s)</summary>
                          <ul className="mt-1 space-y-0.5">
                            {imapResult.errors!.map((e, i) => <li key={i} className="text-[10px] text-slate-700">{e}</li>)}
                          </ul>
                        </details>
                      )}
                      {(imapResult.imported ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("invoices")}
                          className="mt-0.5 text-[10px] font-medium text-slate-900 underline"
                        >
                          Voir les factures importées
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Modal — nouvelle facture */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Fermer" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-lg flex-col rounded-t-lg border border-slate-200 bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Nouvelle facture</h2>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                Fermer
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  title="Sur téléphone ou tablette : ouvre l’appareil photo (caméra arrière si disponible)."
                  className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-400 bg-slate-50 px-3 py-3 text-slate-800 transition active:bg-slate-100 sm:min-h-0 sm:border sm:border-slate-300 sm:bg-white sm:py-3 sm:text-slate-600 sm:hover:border-slate-400 sm:hover:bg-slate-50"
                >
                  <span className="text-xs font-semibold sm:text-[11px]">Prendre une photo</span>
                  <span className="text-[10px] text-slate-500">Caméra · mobile</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Choisir une image ou un PDF dans vos fichiers."
                  className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 sm:min-h-0"
                >
                  <span className="text-[11px] font-medium">Fichiers</span>
                  <span className="text-[10px] text-slate-400">Image ou PDF</span>
                </button>
              </div>
              {/*
                capture=environment : sur mobile, ouvre surtout la caméra arrière (factures).
                Pas de multiple : meilleure compatibilité iOS ; l’utilisateur peut refaire « Prendre une photo ».
              */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileInput}
                className="hidden"
                aria-label="Prendre une photo avec la caméra"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600" htmlFor="create-country-filter">
                  Pays / région
                </label>
                <p className="mb-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-900">
                  Sélection : {regionDisplayLabel(region)}
                </p>
                <input
                  id="create-country-filter"
                  type="search"
                  value={createCountryFilter}
                  onChange={(e) => setCreateCountryFilter(e.target.value)}
                  placeholder="Tapez pour filtrer (ex. bel, maroc…)"
                  autoComplete="off"
                  spellCheck={false}
                  className="mb-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
                <ul
                  role="listbox"
                  aria-label="Pays filtrés"
                  className="max-h-36 overflow-y-auto rounded border border-slate-200 bg-white shadow-inner sm:max-h-40"
                >
                  {IMAP_REGION_OPTIONS_SORTED.filter((o) =>
                    imapCountryFilterMatch(createCountryFilter, o.label, o.value),
                  ).map((o) => (
                    <li key={o.value} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={region === o.value}
                        onClick={() => {
                          setRegion(o.value);
                          setCreateCountryFilter("");
                        }}
                        className={`flex w-full items-center px-2 py-1.5 text-left text-[11px] transition hover:bg-slate-100 ${
                          region === o.value ? "bg-slate-900 font-semibold text-white hover:bg-slate-800" : "text-slate-800"
                        }`}
                      >
                        {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
                {IMAP_REGION_OPTIONS_SORTED.every(
                  (o) => !imapCountryFilterMatch(createCountryFilter, o.label, o.value),
                ) && (
                  <p className="mt-1 text-[10px] text-amber-800">Aucun pays ne correspond.</p>
                )}
                <p className="mt-1 text-[10px] text-slate-500">Même liste que l&apos;import email IMAP (filtres et envoi cabinet).</p>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Catégorie</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 focus:border-slate-500 focus:outline-none">
                  <option value="">Choisir</option>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Montant TTC (€) <span className="font-normal text-slate-400">OCR</span></label>
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 focus:border-slate-500 focus:outline-none" placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Message comptable</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full resize-none rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 focus:border-slate-500 focus:outline-none" placeholder="Optionnel" />
              </div>

              {files.length > 0 && (
                <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-900">{files.length} pièce(s)</p>
                      <p className="text-[10px] text-slate-600">
                        {draftUploading
                          ? "Upload Cloudinary en cours…"
                          : draftAllOnCloudinary
                            ? "Sur Cloudinary — aperçu, téléchargement et envoi disponibles."
                            : "En attente d’upload Cloudinary pour au moins un fichier."}
                      </p>
                    </div>
                    <button type="button" onClick={handleClearAll} className="text-[10px] font-medium text-slate-500 hover:text-slate-900">
                      Tout effacer
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {files.map((file, i) => {
                      const cloud = uploadedUrls.find((u) => u.name === file.name);
                      const isImg = file.type.startsWith("image/");
                      return (
                        <li
                          key={`${file.name}-${i}`}
                          className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            {cloud && isImg ? (
                              <button
                                type="button"
                                onClick={() => openDraftCloudinaryPreview(cloud.url, file.name, true)}
                                className="h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                title="Agrandir"
                              >
                                <img src={cloud.url} alt={file.name} className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-500">
                                {file.type.includes("pdf") ? "PDF" : "IMG"}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium text-slate-900">{file.name}</p>
                              <p className="text-[10px] text-slate-500">
                                {cloud ? (
                                  <span className="font-medium text-emerald-700">Enregistré sur Cloudinary</span>
                                ) : (
                                  <span className="text-amber-700">Upload Cloudinary…</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                            {cloud && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openDraftCloudinaryPreview(cloud.url, file.name, isImg)}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                  Voir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadDraftFromCloudinary(cloud.url, file.name)}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                  Télécharger
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(i)}
                              className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50"
                            >
                              Retirer
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    « Envoyer au cabinet » joint les fichiers à l’e-mail (SMTP) après vérification Cloudinary. « Enregistrer » crée la facture en base avec l’URL Cloudinary.
                  </p>
                </div>
              )}

              {ocrStatus && (
                <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2">
                  <p className="text-[11px] text-blue-900">{ocrStatus}</p>
                </div>
              )}

              {extractedTexts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-slate-600">OCR</p>
                  {extractedTexts.map((item, i) => (
                    <div key={i} className="rounded border border-slate-200 bg-white p-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-500">{item.name}</p>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-700">{item.text}</pre>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleSaveInvoices}
                  disabled={uploading || draftUploading || files.length === 0 || !draftAllOnCloudinary}
                  className="rounded-lg border-2 border-slate-200 bg-slate-100 px-3 py-2.5 text-[11px] font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  type="button"
                  onClick={handleSendToAccountant}
                  disabled={sending || draftUploading || files.length === 0 || !draftAllOnCloudinary}
                  className="rounded-lg bg-slate-900 px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Envoi…" : "Envoyer au cabinet"}
                </button>
              </div>

              {uploadResult && <p className={`border-t border-slate-200 pt-2 text-[11px] ${uploadResult.includes("Erreur") ? "text-slate-800" : "text-slate-700"}`}>{uploadResult}</p>}
              {sendResult && <p className={`border-t border-slate-200 pt-2 text-[11px] ${sendResult.includes("Erreur") || sendResult.includes("Aucun") ? "text-slate-800" : "text-slate-700"}`}>{sendResult}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Menu actions : fixed = pas coupé par overflow du main / du tableau */}
      {openActionMenuId && actionMenuPlacement && actionMenuInvoice && (
        <div
          role="menu"
          data-invoice-action-menu
          className="fixed z-[100] max-h-[min(70vh,calc(100dvh-2rem))] min-w-[11rem] overflow-y-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg"
          style={{ top: actionMenuPlacement.top, left: actionMenuPlacement.left }}
        >
          <ul className="text-left text-[11px] text-slate-700">
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={!actionMenuInvoice.fileUrl}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void previewInvoiceDocument(actionMenuInvoice.id, actionMenuInvoice.originalName);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Voir le document
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={!actionMenuInvoice.fileUrl}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void openInvoiceDocument(actionMenuInvoice.id);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Télécharger (PDF)
              </button>
            </li>
            <li className="pointer-events-none mx-1.5 list-none border-t border-slate-100 py-0" role="separator" />
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={extractingId === actionMenuInvoice.id}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void handleExtract(actionMenuInvoice.id);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40"
              >
                {extractingId === actionMenuInvoice.id ? "Extraction IA…" : "Extraction IA"}
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={sharingId === actionMenuInvoice.id}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void handleShare(actionMenuInvoice.id);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40"
              >
                {shareLinks[actionMenuInvoice.id] ? "Copier le lien de partage" : "Partager (lien)"}
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={sendingInvoiceId === actionMenuInvoice.id || !actionMenuInvoice.fileUrl}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void handleSendSingleInvoice(actionMenuInvoice);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sendingInvoiceId === actionMenuInvoice.id ? "Envoi…" : "Envoyer au cabinet"}
              </button>
            </li>
            <li className="pointer-events-none mx-1.5 list-none border-t border-slate-100 py-0" role="separator" />
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={deletingId === actionMenuInvoice.id}
                onClick={() => {
                  setOpenActionMenuId(null);
                  void handleDelete(actionMenuInvoice);
                }}
                className="w-full px-2.5 py-1.5 text-left text-slate-800 hover:bg-slate-100 disabled:opacity-40"
              >
                {deletingId === actionMenuInvoice.id ? "Suppression…" : "Supprimer"}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
