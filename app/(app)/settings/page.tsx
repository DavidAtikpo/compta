"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IMAP_REGION_OPTIONS_SORTED } from "@/lib/country-regions";
import { parsePdfTable } from "@/lib/pdf-invoice-export";

const emptyPdfTable = (): string[][] => [
  ["", "", "", ""],
  ["", "", "", ""],
];

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
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

interface AccountantRow {
  id: string;
  region: string;
  email: string;
  label: string | null;
}

interface Structure {
  id: string;
  name: string;
  region: string;
  type: string;
  siret: string | null;
}

const LS_DEFAULT_REGION = "compta-default-invoice-region";

type TabId = "overview" | "profile" | "pdf" | "cabinets" | "preferences" | "structures";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "profile", label: "Profil" },
  { id: "pdf", label: "PDF entreprise" },
  { id: "cabinets", label: "Cabinets" },
  { id: "preferences", label: "Préférences" },
  { id: "structures", label: "Structures" },
];

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("compta-token");
}

function notifyProfileChanged() {
  window.dispatchEvent(new Event("compta-profile-updated"));
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("overview");

  const [accountants, setAccountants] = useState<AccountantRow[]>([]);
  const [newCabinetRegion, setNewCabinetRegion] = useState("france");
  const [newCabinetEmail, setNewCabinetEmail] = useState("");
  const [newCabinetLabel, setNewCabinetLabel] = useState("");
  const [cabinetMsg, setCabinetMsg] = useState("");
  const [cabinetSaving, setCabinetSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [structures, setStructures] = useState<Structure[]>([]);
  const [newStruct, setNewStruct] = useState({ name: "", region: "", type: "EURL / SASU", siret: "" });
  const [structMsg, setStructMsg] = useState("");
  const [savingStruct, setSavingStruct] = useState(false);

  const [defaultInvoiceRegion, setDefaultInvoiceRegion] = useState("france");
  const [prefsMsg, setPrefsMsg] = useState("");

  // Profil & PDF (serveur)
  const [accountEmail, setAccountEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [pdfHeader, setPdfHeader] = useState("");
  const [pdfFooter, setPdfFooter] = useState("");
  const [pdfHeaderImageUrl, setPdfHeaderImageUrl] = useState("");
  const [pdfFooterImageUrl, setPdfFooterImageUrl] = useState("");
  const [pdfLogoUrl, setPdfLogoUrl] = useState("");
  const [pdfHeaderTitle, setPdfHeaderTitle] = useState("");
  const [pdfHeaderAddress, setPdfHeaderAddress] = useState("");
  const [pdfTable, setPdfTable] = useState<string[][]>(emptyPdfTable);
  const [pdfAssetUploading, setPdfAssetUploading] = useState<"logo" | "headerImg" | "footerImg" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [pdfMsg, setPdfMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  const loadMe = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.email) {
        setAccountEmail(String(d.email));
        setProfileName(typeof d.name === "string" ? d.name : "");
        setProfileImageUrl(typeof d.imageUrl === "string" ? d.imageUrl : "");
        setPdfHeader(typeof d.pdfHeaderText === "string" ? d.pdfHeaderText : "");
        setPdfFooter(typeof d.pdfFooterText === "string" ? d.pdfFooterText : "");
        setPdfHeaderImageUrl(typeof d.pdfHeaderImageUrl === "string" ? d.pdfHeaderImageUrl : "");
        setPdfFooterImageUrl(typeof d.pdfFooterImageUrl === "string" ? d.pdfFooterImageUrl : "");
        setPdfLogoUrl(typeof d.pdfLogoUrl === "string" ? d.pdfLogoUrl : "");
        setPdfHeaderTitle(typeof d.pdfHeaderTitle === "string" ? d.pdfHeaderTitle : "");
        setPdfHeaderAddress(typeof d.pdfHeaderAddress === "string" ? d.pdfHeaderAddress : "");
        const tj = typeof d.pdfHeaderTableJson === "string" ? d.pdfHeaderTableJson : "";
        const parsed = parsePdfTable(tj || null);
        setPdfTable(parsed ?? emptyPdfTable());
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    loadAccountants();
    loadStructures();
    void loadMe();
    if (typeof window !== "undefined") {
      const r = window.localStorage.getItem(LS_DEFAULT_REGION);
      if (r?.trim()) setDefaultInvoiceRegion(r.trim().toLowerCase());
    }
  }, [loadMe]);

  const knownRegions = useMemo(
    () =>
      Array.from(
        new Set([
          ...accountants.map((a) => a.region),
          ...structures.map((s) => s.region).filter(Boolean),
          ...regionOptions.map((r) => r.value),
        ]),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [accountants, structures],
  );

  const accountantsByRegion = useMemo(() => {
    const m = new Map<string, AccountantRow[]>();
    for (const a of accountants) {
      const list = m.get(a.region) ?? [];
      list.push(a);
      m.set(a.region, list);
    }
    return m;
  }, [accountants]);

  const loadAccountants = async () => {
    try {
      const res = await fetch("/api/accountants");
      if (res.ok) {
        const list: AccountantRow[] = await res.json();
        setAccountants(list);
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
    } catch {
      /* silent */
    }
  };

  const applyAuthPayload = (data: { token?: string }) => {
    if (data.token) window.localStorage.setItem("compta-token", data.token);
    notifyProfileChanged();
  };

  const handleSaveProfileName = async () => {
    const t = getToken();
    if (!t) return;
    setProfileSaving(true);
    setProfileMsg("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ name: profileName.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg(data.error ?? "Erreur d’enregistrement.");
        return;
      }
      applyAuthPayload(data);
      setProfileMsg("Profil enregistré.");
    } catch {
      setProfileMsg("Erreur réseau.");
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg(""), 4000);
    }
  };

  const patchPdfField = async (
    payload: Record<string, string | null>,
    okMsg: string,
  ): Promise<boolean> => {
    const tok = getToken();
    if (!tok) return false;
    setPdfMsg("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPdfMsg(typeof data.error === "string" ? data.error : "Erreur d’enregistrement.");
        setTimeout(() => setPdfMsg(""), 5000);
        return false;
      }
      applyAuthPayload(data);
      setPdfMsg(okMsg);
      setTimeout(() => setPdfMsg(""), 4000);
      return true;
    } catch {
      setPdfMsg("Erreur réseau.");
      setTimeout(() => setPdfMsg(""), 5000);
      return false;
    }
  };

  const handleUploadPdfImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "pdfLogoUrl" | "pdfHeaderImageUrl" | "pdfFooterImageUrl",
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const map: Record<typeof field, "logo" | "headerImg" | "footerImg"> = {
      pdfLogoUrl: "logo",
      pdfHeaderImageUrl: "headerImg",
      pdfFooterImageUrl: "footerImg",
    };
    setPdfAssetUploading(map[field]);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const raw = await up.json().catch(() => ({}));
      if (!up.ok || !raw.url) {
        setPdfMsg(typeof raw.error === "string" ? raw.error : "Échec de l’envoi.");
        setTimeout(() => setPdfMsg(""), 5000);
        return;
      }
      const ok = await patchPdfField({ [field]: raw.url } as Record<string, string | null>, "Image enregistrée.");
      if (ok) {
        if (field === "pdfLogoUrl") setPdfLogoUrl(raw.url);
        if (field === "pdfHeaderImageUrl") setPdfHeaderImageUrl(raw.url);
        if (field === "pdfFooterImageUrl") setPdfFooterImageUrl(raw.url);
      }
    } finally {
      setPdfAssetUploading(null);
    }
  };

  const handleSavePdfBranding = async () => {
    const t = getToken();
    if (!t) return;
    setPdfSaving(true);
    setPdfMsg("");
    try {
      const tableAllEmpty = pdfTable.every((row) => row.every((c) => !String(c).trim()));
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          pdfHeaderText: pdfHeader.trim() || null,
          pdfFooterText: pdfFooter.trim() || null,
          pdfHeaderImageUrl: pdfHeaderImageUrl.trim() || null,
          pdfFooterImageUrl: pdfFooterImageUrl.trim() || null,
          pdfLogoUrl: pdfLogoUrl.trim() || null,
          pdfHeaderTitle: pdfHeaderTitle.trim() || null,
          pdfHeaderAddress: pdfHeaderAddress.trim() || null,
          pdfHeaderTableJson: tableAllEmpty ? null : JSON.stringify(pdfTable),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPdfMsg(data.error ?? "Erreur d’enregistrement.");
        return;
      }
      applyAuthPayload(data);
      setPdfMsg("En-tête et pied de page enregistrés.");
    } catch {
      setPdfMsg("Erreur réseau.");
    } finally {
      setPdfSaving(false);
      setTimeout(() => setPdfMsg(""), 4000);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Les nouveaux mots de passe ne correspondent pas.");
      setTimeout(() => setPasswordMsg(""), 4000);
      return;
    }
    const t = getToken();
    if (!t) return;
    setPasswordSaving(true);
    setPasswordMsg("");
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMsg(data.error ?? "Erreur.");
        return;
      }
      applyAuthPayload(data);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg("Mot de passe mis à jour.");
    } catch {
      setPasswordMsg("Erreur réseau.");
    } finally {
      setPasswordSaving(false);
      setTimeout(() => setPasswordMsg(""), 4000);
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const t = getToken();
    if (!t) return;
    setAvatarUploading(true);
    setProfileMsg("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const raw = await up.json().catch(() => ({}));
      if (!up.ok || !raw.url) {
        setProfileMsg(typeof raw.error === "string" ? raw.error : "Échec de l’envoi de la photo.");
        setTimeout(() => setProfileMsg(""), 5000);
        return;
      }
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ imageUrl: raw.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg(data.error ?? "Impossible d’enregistrer la photo.");
        setTimeout(() => setProfileMsg(""), 5000);
        return;
      }
      setProfileImageUrl(typeof data.imageUrl === "string" ? data.imageUrl : raw.url);
      applyAuthPayload(data);
      setProfileMsg("Photo de profil mise à jour.");
    } catch {
      setProfileMsg("Erreur réseau.");
    } finally {
      setAvatarUploading(false);
      setTimeout(() => setProfileMsg(""), 4000);
    }
  };

  const handleRemoveAvatar = async () => {
    const t = getToken();
    if (!t) return;
    setAvatarUploading(true);
    setProfileMsg("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ imageUrl: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg(data.error ?? "Erreur.");
        return;
      }
      setProfileImageUrl("");
      applyAuthPayload(data);
      setProfileMsg("Photo retirée.");
    } catch {
      setProfileMsg("Erreur réseau.");
    } finally {
      setAvatarUploading(false);
      setTimeout(() => setProfileMsg(""), 4000);
    }
  };

  const handleAddCabinet = async () => {
    const region = newCabinetRegion.trim().toLowerCase();
    const email = newCabinetEmail.trim();
    if (!region || !email) {
      setCabinetMsg("Indiquez un pays et un email.");
      return;
    }
    setCabinetSaving(true);
    setCabinetMsg("");
    try {
      const res = await fetch("/api/accountants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          email,
          label: newCabinetLabel.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCabinetMsg(data.error ?? "Erreur d’enregistrement.");
        return;
      }
      setNewCabinetEmail("");
      setNewCabinetLabel("");
      await loadAccountants();
      setCabinetMsg("Cabinet ajouté.");
    } catch {
      setCabinetMsg("Erreur réseau.");
    } finally {
      setCabinetSaving(false);
      setTimeout(() => setCabinetMsg(""), 4000);
    }
  };

  const handleDeleteCabinet = async (id: string) => {
    if (!window.confirm("Retirer ce cabinet de la liste ?")) return;
    try {
      const res = await fetch(`/api/accountants/${id}`, { method: "DELETE" });
      if (res.ok) await loadAccountants();
    } catch {
      /* silent */
    }
  };

  const handleSaveDefaultRegion = () => {
    const v = defaultInvoiceRegion.trim().toLowerCase();
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_DEFAULT_REGION, v);
    setPrefsMsg("Pays par défaut enregistré pour les nouvelles factures.");
    setTimeout(() => setPrefsMsg(""), 3500);
  };

  const handleAddStructure = async () => {
    if (!newStruct.name.trim() || !newStruct.region.trim()) return;
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
        setNewStruct({ name: "", region: "", type: "EURL / SASU", siret: "" });
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

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm animate-pulse">
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
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gérez votre profil, l’apparence des PDF, les cabinets comptables et vos préférences.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                tab === id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="font-semibold text-blue-900">Première configuration</h2>
            <p className="mt-1 text-xs text-blue-800">
              Complétez ces points pour que l’envoi au cabinet et les factures soient cohérents.
            </p>
            <ul className="mt-3 list-inside list-decimal space-y-1.5 text-sm text-blue-900">
              <li>Renseignez votre profil et, si besoin, l’en-tête / pied de page des exports PDF.</li>
              <li>Ajoutez au moins une adresse de cabinet par pays utilisé (plusieurs possibles par pays).</li>
              <li>Décrire vos structures juridiques (facultatif mais utile pour les filtres).</li>
              <li>
                Si l’envoi au cabinet ou l’envoi par email ne fonctionne pas, vérifiez votre connexion ou contactez la
                personne qui gère l’application.
              </li>
              <li>
                Pour importer des factures depuis une boîte mail, ouvrez{" "}
                <Link href="/invoices" className="font-semibold underline decoration-blue-900/40 hover:text-blue-950">
                  Factures
                </Link>{" "}
                puis l’onglet d’import par email.
              </li>
            </ul>
          </div>
        )}

        {tab === "profile" && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Photo et nom</h2>
                <p className="mt-1 text-xs text-slate-500">La photo apparaît en haut à droite de l’application.</p>
              </div>
              <div className="space-y-4 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-4">
                    {profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profileImageUrl}
                        alt=""
                        className="h-20 w-20 rounded-2xl border border-slate-200 object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-2xl text-slate-400">
                        ?
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-center text-sm font-medium text-slate-800 hover:bg-slate-100">
                        {avatarUploading ? "Envoi…" : "Choisir une photo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={avatarUploading}
                          onChange={(e) => void handleAvatarFile(e)}
                        />
                      </label>
                      {profileImageUrl && (
                        <button
                          type="button"
                          disabled={avatarUploading}
                          onClick={() => void handleRemoveAvatar()}
                          className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        >
                          Retirer la photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email (non modifiable)</label>
                  <input
                    readOnly
                    value={accountEmail}
                    className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Nom affiché</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="Votre nom ou pseudo"
                  />
                </div>
                <button
                  type="button"
                  disabled={profileSaving}
                  onClick={() => void handleSaveProfileName()}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {profileSaving ? "Enregistrement…" : "Enregistrer le nom"}
                </button>
                {profileMsg && (
                  <p
                    className={`text-sm ${
                      profileMsg.includes("Erreur") || profileMsg.includes("échec") || profileMsg.includes("Impossible")
                        ? "text-rose-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {profileMsg}
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Mot de passe</h2>
                <p className="mt-1 text-xs text-slate-500">Minimum 6 caractères.</p>
              </div>
              <div className="space-y-3 p-6">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  placeholder="Mot de passe actuel"
                  autoComplete="current-password"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  placeholder="Nouveau mot de passe"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  placeholder="Confirmer le nouveau mot de passe"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  disabled={passwordSaving || !currentPassword || !newPassword}
                  onClick={() => void handleChangePassword()}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  {passwordSaving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
                </button>
                {passwordMsg && (
                  <p
                    className={`text-sm ${
                      passwordMsg.includes("incorrect") || passwordMsg.includes("Erreur") || passwordMsg.includes("ne correspondent")
                        ? "text-rose-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {passwordMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "pdf" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Deux modes possibles</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-900">
                <li>
                  <strong>Images complètes</strong> : une image pour tout l’en-tête et/ou le pied de page (bandeau). Elle
                  remplace la mise en page texte du haut ou du bas pour l’export PDF.
                </li>
                <li>
                  <strong>Mise en page</strong> : logo, titre, adresse, tableau 4×2, puis texte libre ; sinon uniquement
                  le texte libre d’en-tête / pied.
                </li>
              </ul>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Images en-tête / pied (optionnel)</h2>
                <p className="mt-1 text-xs text-slate-500">PNG ou JPG recommandés (largeur proche d’une page A4 en paysage pour un rendu net).</p>
              </div>
              <div className="grid gap-6 p-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Image d’en-tête pleine largeur</p>
                  {pdfHeaderImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pdfHeaderImageUrl}
                      alt=""
                      className="max-h-24 w-full rounded-lg border border-slate-200 object-contain object-left"
                    />
                  ) : (
                    <p className="text-xs text-slate-400">Aucune image</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100">
                      {pdfAssetUploading === "headerImg" ? "Envoi…" : "Téléverser"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={pdfAssetUploading !== null}
                        onChange={(e) => void handleUploadPdfImage(e, "pdfHeaderImageUrl")}
                      />
                    </label>
                    {pdfHeaderImageUrl && (
                      <button
                        type="button"
                        disabled={pdfAssetUploading !== null}
                        onClick={() =>
                          void patchPdfField({ pdfHeaderImageUrl: null }, "En-tête image retirée.").then((ok) => {
                            if (ok) setPdfHeaderImageUrl("");
                          })
                        }
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Image de pied de page</p>
                  {pdfFooterImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pdfFooterImageUrl}
                      alt=""
                      className="max-h-24 w-full rounded-lg border border-slate-200 object-contain object-left"
                    />
                  ) : (
                    <p className="text-xs text-slate-400">Aucune image</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100">
                      {pdfAssetUploading === "footerImg" ? "Envoi…" : "Téléverser"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={pdfAssetUploading !== null}
                        onChange={(e) => void handleUploadPdfImage(e, "pdfFooterImageUrl")}
                      />
                    </label>
                    {pdfFooterImageUrl && (
                      <button
                        type="button"
                        disabled={pdfAssetUploading !== null}
                        onClick={() =>
                          void patchPdfField({ pdfFooterImageUrl: null }, "Pied image retiré.").then((ok) => {
                            if (ok) setPdfFooterImageUrl("");
                          })
                        }
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Logo, titre, adresse & tableau</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Ignoré pour l’en-tête si une <strong>image d’en-tête</strong> est définie ci-dessus. Le logo apparaît à
                  gauche, le titre et l’adresse à droite ; le tableau 4×2 s’affiche en dessous.
                </p>
              </div>
              <div className="space-y-5 p-6">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">Logo entreprise</p>
                    {pdfLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pdfLogoUrl}
                        alt=""
                        className="h-16 w-16 rounded-lg border border-slate-200 object-contain"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                        —
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100">
                        {pdfAssetUploading === "logo" ? "Envoi…" : "Choisir le logo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={pdfAssetUploading !== null}
                          onChange={(e) => void handleUploadPdfImage(e, "pdfLogoUrl")}
                        />
                      </label>
                      {pdfLogoUrl && (
                        <button
                          type="button"
                          disabled={pdfAssetUploading !== null}
                          onClick={() =>
                            void patchPdfField({ pdfLogoUrl: null }, "Logo retiré.").then((ok) => {
                              if (ok) setPdfLogoUrl("");
                            })
                          }
                          className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Grand titre</label>
                      <input
                        type="text"
                        value={pdfHeaderTitle}
                        onChange={(e) => setPdfHeaderTitle(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        placeholder="Nom commercial / raison sociale"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Adresse & informations</label>
                      <textarea
                        value={pdfHeaderAddress}
                        onChange={(e) => setPdfHeaderAddress(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        placeholder={"Lignes d’adresse, téléphone, email…"}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-600">Tableau (4 colonnes × 2 lignes)</label>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[280px] border-collapse text-sm">
                      <tbody>
                        {pdfTable.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="border border-slate-200 p-0">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPdfTable((prev) => {
                                      const n = prev.map((r) => [...r]);
                                      n[ri]![ci] = v;
                                      return n;
                                    });
                                  }}
                                  className="w-full min-w-0 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:bg-slate-50"
                                  placeholder="—"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Première ligne, puis deuxième ligne (ex. SIRET, TVA, capital…).</p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Texte libre sous la zone (en-tête)</label>
                  <textarea
                    value={pdfHeader}
                    onChange={(e) => setPdfHeader(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="Texte additionnel sous le tableau (facultatif)."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Pied de page texte</label>
                  <p className="mb-2 text-[11px] text-slate-500">
                    Affiché sous la mention de page si vous n’utilisez pas uniquement l’image de pied.
                  </p>
                  <textarea
                    value={pdfFooter}
                    onChange={(e) => setPdfFooter(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="Mentions légales, RCS, contact…"
                  />
                </div>

                <button
                  type="button"
                  disabled={pdfSaving}
                  onClick={() => void handleSavePdfBranding()}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {pdfSaving ? "Enregistrement…" : "Enregistrer la mise en page PDF"}
                </button>
                {pdfMsg && (
                  <p
                    className={`text-sm ${
                      pdfMsg.includes("Erreur") || pdfMsg.includes("Échec") || pdfMsg.includes("invalide")
                        ? "text-rose-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {pdfMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "cabinets" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Cabinets comptables</h2>
              <p className="mt-1 text-xs text-slate-500">
                L’envoi « au cabinet » envoie une copie à <strong>toutes</strong> les adresses du pays concerné. Plusieurs
                emails peuvent être enregistrés pour un même pays.
              </p>
            </div>
            <div className="space-y-5 p-6">
              {accountants.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Aucun cabinet enregistré — ajoutez au moins une adresse par pays utilisé.
                </p>
              ) : (
                <div className="space-y-6">
                  {Array.from(accountantsByRegion.entries()).map(([region, rows]) => (
                    <div key={region}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {regionOptions.find((r) => r.value === region)?.flag} {region}
                      </p>
                      <ul className="space-y-2">
                        {rows.map((a) => (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{a.email}</p>
                              {a.label && <p className="text-xs text-slate-600">{a.label}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteCabinet(a.id)}
                              className="shrink-0 text-xs font-medium text-rose-600 hover:text-rose-800"
                            >
                              Retirer
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-800">Ajouter un cabinet</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Pays ou zone</label>
                  <input
                    type="text"
                    list="settings-cabinet-regions"
                    value={newCabinetRegion}
                    onChange={(e) => setNewCabinetRegion(e.target.value.trim().toLowerCase())}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                    placeholder="france, togo, senegal…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <datalist id="settings-cabinet-regions">
                    {IMAP_REGION_OPTIONS_SORTED.map((o) => (
                      <option key={o.value} value={o.value} label={o.label} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Libellé (optionnel)</label>
                  <input
                    type="text"
                    value={newCabinetLabel}
                    onChange={(e) => setNewCabinetLabel(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="Ex. Cabinet Dupont, Filiale Lyon…"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email du cabinet</label>
                  <input
                    type="email"
                    value={newCabinetEmail}
                    onChange={(e) => setNewCabinetEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="contact@cabinet.fr"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddCabinet()}
                  disabled={cabinetSaving || !newCabinetEmail.trim()}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cabinetSaving ? "Enregistrement…" : "Ajouter ce cabinet"}
                </button>
                {cabinetMsg && (
                  <p
                    className={`text-center text-sm ${
                      cabinetMsg.includes("Erreur") ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {cabinetMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "preferences" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Préférences</h2>
              <p className="mt-1 text-xs text-slate-500">Ces réglages sont mémorisés sur cet ordinateur.</p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Pays ou zone par défaut (nouvelle facture)
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  Préremplit le sélecteur lorsque vous ouvrez « Nouvelle facture » sur la page Factures.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <select
                    value={defaultInvoiceRegion}
                    onChange={(e) => setDefaultInvoiceRegion(e.target.value)}
                    className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  >
                    {IMAP_REGION_OPTIONS_SORTED.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveDefaultRegion}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    Enregistrer
                  </button>
                </div>
                {prefsMsg && <p className="mt-2 text-sm text-emerald-700">{prefsMsg}</p>}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p className="font-medium text-slate-800">Export PDF</p>
                <p className="mt-1">
                  Sur la page Factures, cochez les pièces puis lancez l’export : un seul fichier peut regrouper plusieurs
                  factures à la fois ; un plafond peut s’appliquer selon la liste.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === "structures" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Structures juridiques</h2>
              <p className="mt-1 text-xs text-slate-400">Plusieurs entités (sociétés, associations) par pays.</p>
            </div>
            <div className="space-y-5 p-6">
              {structures.length > 0 && (
                <ul className="space-y-2">
                  {structures.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">
                          {regionOptions.find((r) => r.value === s.region)?.flag} {s.region} — {s.type}
                          {s.siret ? ` — SIRET ${s.siret}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStructure(s.id)}
                        className="text-xs text-rose-500 transition hover:text-rose-700"
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-800">Ajouter une structure</p>
                <input
                  type="text"
                  value={newStruct.name}
                  onChange={(e) => setNewStruct((s) => ({ ...s, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  placeholder="Nom de la société / structure"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newStruct.region}
                    onChange={(e) => setNewStruct((s) => ({ ...s, region: e.target.value.trim().toLowerCase() }))}
                    list="known-regions-list"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none"
                    placeholder="Pays / zone"
                  />
                  <select
                    value={newStruct.type}
                    onChange={(e) => setNewStruct((s) => ({ ...s, type: e.target.value }))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none"
                  >
                    {businessTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <datalist id="known-regions-list">
                  {knownRegions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <input
                  type="text"
                  value={newStruct.siret}
                  onChange={(e) => setNewStruct((s) => ({ ...s, siret: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  placeholder="SIRET (optionnel)"
                />
                <button
                  type="button"
                  onClick={() => void handleAddStructure()}
                  disabled={savingStruct || !newStruct.name.trim()}
                  className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {savingStruct ? "Ajout…" : "Ajouter la structure"}
                </button>
                {structMsg && (
                  <p
                    className={`rounded-lg px-3 py-2 text-center text-xs ${
                      structMsg.includes("Erreur") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {structMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
