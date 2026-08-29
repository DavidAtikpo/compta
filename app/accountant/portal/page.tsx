"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ACCOUNTANT_PORTAL_LS_TOKEN } from "@/lib/accountant-portal";
import { regionDisplayLabel } from "@/lib/country-regions";
import { formatInvoiceAmount, invoiceCurrencySymbol } from "@/lib/invoice-currency";

type PortalInvoice = {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  montantHT: number | null;
  montantTTC: number | null;
  currency: string | null;
  category: string | null;
  invoiceType: string | null;
  fournisseur: string | null;
  numeroFacture: string | null;
  invoiceDate: string | null;
  sentAt: string | null;
  createdAt: string;
  shareToken: string | null;
  accountantReviewStatus: string | null;
  accountantReviewNote: string | null;
  accountantReviewedAt: string | null;
  clientEmail: string | null;
  clientName: string | null;
  cabinetLabel: string | null;
  cabinetEmail: string | null;
  enterpriseId: string | null;
  enterpriseName: string | null;
  enterpriseSiret: string | null;
  structureName: string | null;
  ownerUserId: string | null;
  recipientCabinetEmails?: string[];
};

type PortalCabinet = {
  id: string;
  email: string;
  label: string | null;
  region: string;
};

type PortalData = {
  email: string;
  mode?: "owner" | "cabinet";
  cabinets?: PortalCabinet[];
  invoices: PortalInvoice[];
};

type ReviewFilter = "" | "pending" | "validated" | "rejected";
type ViewMode = "list" | "enterprises" | "cabinets";
type ReviewAction = "validated" | "rejected";

function cabinetDisplayLabel(cab: { label: string | null; email: string }): string {
  return cab.label?.trim() || cab.email;
}

function invoiceBelongsToCabinet(inv: PortalInvoice, cabinetEmail: string): boolean {
  const key = cabinetEmail.trim().toLowerCase();
  const recipients = inv.recipientCabinetEmails ?? [];
  if (recipients.some((e) => e.trim().toLowerCase() === key)) return true;
  return (inv.cabinetEmail ?? "").trim().toLowerCase() === key;
}

function reviewKey(status: string | null): ReviewFilter {
  if (status === "validated" || status === "rejected") return status;
  return "pending";
}

function enterpriseKey(inv: PortalInvoice): string {
  return inv.enterpriseId ?? inv.ownerUserId ?? inv.clientEmail ?? inv.id;
}

function enterpriseLabel(inv: PortalInvoice): string {
  return inv.enterpriseName || inv.structureName || inv.clientName || inv.clientEmail || "Entreprise inconnue";
}

function clientLabel(inv: PortalInvoice): string {
  return inv.clientName || inv.clientEmail || "—";
}

function invoiceTTC(inv: PortalInvoice): number | null {
  return inv.montantTTC ?? inv.amount;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function exportCsv(invoices: PortalInvoice[]) {
  const headers = [
    "Entreprise",
    "SIRET",
    "Contact client",
    "Email client",
    "Région",
    "Type",
    "Fournisseur",
    "N° facture",
    "Date",
    "Devise",
    "HT",
    "TTC",
    "Revue",
    "Commentaire",
    "Transmise le",
  ];
  const rows = invoices.map((inv) => [
    enterpriseLabel(inv),
    inv.enterpriseSiret ?? "",
    inv.clientName ?? "",
    inv.clientEmail ?? "",
    inv.region,
    inv.invoiceType ?? "",
    inv.fournisseur ?? inv.originalName,
    inv.numeroFacture ?? "",
    inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : "",
    inv.currency ?? "EUR",
    inv.montantHT?.toFixed(2) ?? "",
    invoiceTTC(inv)?.toFixed(2) ?? "",
    reviewKey(inv.accountantReviewStatus) === "pending" ? "À traiter" : inv.accountantReviewStatus ?? "",
    inv.accountantReviewNote ?? "",
    inv.sentAt ? new Date(inv.sentAt).toISOString().slice(0, 10) : "",
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map((c) => escape(String(c))).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factures-cabinet-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [portalMode, setPortalMode] = useState<"owner" | "cabinet">("cabinet");
  const [configuredCabinets, setConfiguredCabinets] = useState<PortalCabinet[]>([]);
  const [allInvoices, setAllInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterEnterprise, setFilterEnterprise] = useState("");
  const [filterCabinet, setFilterCabinet] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterReview, setFilterReview] = useState<ReviewFilter>("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<PortalInvoice | null>(null);
  const [noteModal, setNoteModal] = useState<
    { ids: string[]; action: ReviewAction } | null
  >(null);
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    const urlToken = searchParams.get("token");
    if (urlToken) {
      window.localStorage.setItem(ACCOUNTANT_PORTAL_LS_TOKEN, urlToken);
      setToken(urlToken);
      router.replace("/accountant/portal");
      return;
    }
    const stored = window.localStorage.getItem(ACCOUNTANT_PORTAL_LS_TOKEN);
    if (stored) setToken(stored);
    else {
      setLoading(false);
      router.replace("/accountant/login");
    }
  }, [searchParams, router]);

  const authHeaders = useMemo((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/accountant-portal/me", { headers: authHeaders });
      if (!meRes.ok) {
        window.localStorage.removeItem(ACCOUNTANT_PORTAL_LS_TOKEN);
        router.replace("/accountant/login");
        return;
      }
      const me = await meRes.json();
      setEmail(me.email);
      const mode: "owner" | "cabinet" = me.mode === "owner" ? "owner" : "cabinet";
      setPortalMode(mode);
      setConfiguredCabinets(Array.isArray(me.cabinets) ? me.cabinets : []);
      if (mode === "owner") setViewMode("cabinets");

      const invRes = await fetch("/api/accountant-portal/invoices", { headers: authHeaders });
      if (!invRes.ok) throw new Error();
      const data = (await invRes.json()) as PortalData;
      setAllInvoices(data.invoices);
      if (Array.isArray(data.cabinets) && data.cabinets.length > 0) {
        setConfiguredCabinets(data.cabinets);
      }
    } catch {
      setError("Impossible de charger les factures.");
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders, router]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const enterpriseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of allInvoices) {
      const key = enterpriseKey(inv);
      map.set(key, enterpriseLabel(inv));
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [allInvoices]);

  const regionOptions = useMemo(() => {
    const set = new Set(allInvoices.map((i) => i.region).filter(Boolean));
    return Array.from(set).sort((a, b) => regionDisplayLabel(a).localeCompare(regionDisplayLabel(b), "fr"));
  }, [allInvoices]);

  const currencyOptions = useMemo(() => {
    const set = new Set(allInvoices.map((i) => i.currency ?? "EUR"));
    return Array.from(set).sort();
  }, [allInvoices]);

  const cabinetOptions = useMemo(() => {
    return configuredCabinets
      .map((c) => ({
        value: c.email,
        label: `${cabinetDisplayLabel(c)} · ${regionDisplayLabel(c.region)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [configuredCabinets]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allInvoices.filter((inv) => {
      if (filterEnterprise && enterpriseKey(inv) !== filterEnterprise) return false;
      if (filterCabinet && !invoiceBelongsToCabinet(inv, filterCabinet)) return false;
      if (filterRegion && inv.region !== filterRegion) return false;
      if (filterCurrency && (inv.currency ?? "EUR") !== filterCurrency) return false;
      if (filterType && (inv.invoiceType ?? "") !== filterType) return false;
      if (filterReview && reviewKey(inv.accountantReviewStatus) !== filterReview) return false;
      if (!q) return true;
      const hay = [
        inv.enterpriseName,
        inv.enterpriseSiret,
        inv.structureName,
        inv.clientName,
        inv.clientEmail,
        inv.fournisseur,
        inv.originalName,
        inv.numeroFacture,
        inv.category,
        inv.region,
        inv.invoiceType,
        inv.cabinetLabel,
        inv.cabinetEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allInvoices, search, filterEnterprise, filterCabinet, filterRegion, filterCurrency, filterType, filterReview]);

  const groupedByCabinet = useMemo(() => {
    const groups = new Map<
      string,
      { email: string; label: string; region: string; invoices: PortalInvoice[] }
    >();

    for (const cab of configuredCabinets) {
      groups.set(cab.email.toLowerCase(), {
        email: cab.email,
        label: cabinetDisplayLabel(cab),
        region: cab.region,
        invoices: [],
      });
    }

    for (const inv of filteredInvoices) {
      const recipients =
        inv.recipientCabinetEmails && inv.recipientCabinetEmails.length > 0
          ? inv.recipientCabinetEmails
          : inv.cabinetEmail
            ? [inv.cabinetEmail]
            : [];

      if (recipients.length === 0) {
        const key = "__unsent__";
        if (!groups.has(key)) {
          groups.set(key, {
            email: "",
            label: "Non transmises",
            region: "",
            invoices: [],
          });
        }
        groups.get(key)!.invoices.push(inv);
        continue;
      }

      for (const raw of recipients) {
        const emailKey = raw.trim().toLowerCase();
        if (!groups.has(emailKey)) {
          const configured = configuredCabinets.find((c) => c.email.toLowerCase() === emailKey);
          groups.set(emailKey, {
            email: raw,
            label: configured ? cabinetDisplayLabel(configured) : raw,
            region: configured?.region ?? inv.region,
            invoices: [],
          });
        }
        groups.get(emailKey)!.invoices.push(inv);
      }
    }

    const unsent = groups.get("__unsent__");
    const configuredKeys = new Set(configuredCabinets.map((c) => c.email.toLowerCase()));

    if (configuredCabinets.length > 0) {
      const ordered = configuredCabinets.map((cab) => {
        const key = cab.email.toLowerCase();
        return (
          groups.get(key) ?? {
            email: cab.email,
            label: cabinetDisplayLabel(cab),
            region: cab.region,
            invoices: [],
          }
        );
      });
      const extras = Array.from(groups.values()).filter(
        (g) => g.email && !configuredKeys.has(g.email.toLowerCase()) && g.invoices.length > 0,
      );
      const tail = unsent && unsent.invoices.length > 0 ? [unsent] : [];
      return [...ordered, ...extras, ...tail];
    }

    return Array.from(groups.values())
      .filter((g) => g.invoices.length > 0)
      .sort((a, b) => {
        if (a.email === "") return 1;
        if (b.email === "") return -1;
        return a.label.localeCompare(b.label, "fr");
      });
  }, [filteredInvoices, configuredCabinets]);

  const counts = useMemo(
    () => ({
      total: allInvoices.length,
      pendingReview: allInvoices.filter((i) => !i.accountantReviewStatus).length,
      validated: allInvoices.filter((i) => i.accountantReviewStatus === "validated").length,
      rejected: allInvoices.filter((i) => i.accountantReviewStatus === "rejected").length,
    }),
    [allInvoices],
  );

  const totalsByCurrency = useMemo(() => {
    const out: Record<string, { count: number; totalHT: number; totalTTC: number; achatTTC: number; venteTTC: number }> = {};
    for (const inv of filteredInvoices) {
      const c = inv.currency ?? "EUR";
      if (!out[c]) out[c] = { count: 0, totalHT: 0, totalTTC: 0, achatTTC: 0, venteTTC: 0 };
      out[c].count++;
      const ttc = invoiceTTC(inv);
      if (ttc != null) {
        out[c].totalTTC += ttc;
        if (inv.invoiceType === "vente") out[c].venteTTC += ttc;
        else out[c].achatTTC += ttc;
      }
      if (inv.montantHT != null) out[c].totalHT += inv.montantHT;
    }
    return out;
  }, [filteredInvoices]);

  const groupedByEnterprise = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; siret: string | null; contact: string | null; invoices: PortalInvoice[] }
    >();
    for (const inv of filteredInvoices) {
      const key = enterpriseKey(inv);
      if (!groups.has(key)) {
        groups.set(key, {
          label: enterpriseLabel(inv),
          siret: inv.enterpriseSiret,
          contact: inv.clientName || inv.clientEmail,
          invoices: [],
        });
      }
      groups.get(key)!.invoices.push(inv);
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [filteredInvoices]);

  const selectedPending = useMemo(
    () => filteredInvoices.filter((i) => selected.has(i.id) && !i.accountantReviewStatus),
    [filteredInvoices, selected],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredInvoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredInvoices.map((i) => i.id)));
    }
  };

  const selectPendingVisible = () => {
    setSelected(new Set(filteredInvoices.filter((i) => !i.accountantReviewStatus).map((i) => i.id)));
  };

  const submitReview = async (ids: string[], reviewStatus: ReviewAction, note: string) => {
    if (ids.length === 0) return;
    const single = ids.length === 1;
    if (single) setBusyId(ids[0]);
    else setBulkBusy(true);
    try {
      const res =
        ids.length === 1
          ? await fetch(`/api/accountant-portal/invoices/${ids[0]}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({ reviewStatus, reviewNote: note || null }),
            })
          : await fetch("/api/accountant-portal/invoices/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({ ids, reviewStatus, reviewNote: note || null }),
            });
      if (!res.ok) throw new Error();
      setNoteModal(null);
      setReviewNote("");
      setSelected(new Set());
      await load();
    } catch {
      setError("Échec de la mise à jour.");
    } finally {
      setBusyId("");
      setBulkBusy(false);
    }
  };

  const downloadFile = async (inv: PortalInvoice) => {
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/accountant-portal/invoices/${inv.id}/file`, { headers: authHeaders });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = inv.originalName || "facture";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Téléchargement impossible.");
    } finally {
      setBusyId("");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilterEnterprise("");
    setFilterCabinet("");
    setFilterRegion("");
    setFilterCurrency("");
    setFilterType("");
    setFilterReview("");
  };

  const hasActiveFilters =
    search || filterEnterprise || filterCabinet || filterRegion || filterCurrency || filterType || filterReview;

  const isOwnerView = portalMode === "owner";

  const logout = () => {
    window.localStorage.removeItem(ACCOUNTANT_PORTAL_LS_TOKEN);
    router.replace("/accountant/login");
  };

  if (!token && loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">Connexion…</div>;
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-700 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Compta IA</p>
            <h1 className="text-xl font-bold text-white">Portail comptable</h1>
            <p className="text-sm text-slate-200">{email || "…"}</p>
            {isOwnerView ? (
              <p className="text-xs text-indigo-200">
                Vue propriétaire — {configuredCabinets.length} cabinet(s) · factures transmises par destinataire
              </p>
            ) : (
              enterpriseOptions.length > 0 && (
                <p className="text-xs text-slate-300">
                  {enterpriseOptions.length} entreprise(s) cliente(s)
                </p>
              )
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportCsv(filteredInvoices)}
              disabled={filteredInvoices.length === 0}
              className="rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="text-xs underline">
              Fermer
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Total"
            value={counts.total}
            active={filterReview === ""}
            onClick={() => setFilterReview("")}
          />
          <StatCard
            label="À traiter"
            value={counts.pendingReview}
            accent="amber"
            active={filterReview === "pending"}
            onClick={() => setFilterReview(filterReview === "pending" ? "" : "pending")}
          />
          <StatCard
            label="Validées"
            value={counts.validated}
            accent="emerald"
            active={filterReview === "validated"}
            onClick={() => setFilterReview(filterReview === "validated" ? "" : "validated")}
          />
          <StatCard
            label="Rejetées"
            value={counts.rejected}
            accent="rose"
            active={filterReview === "rejected"}
            onClick={() => setFilterReview(filterReview === "rejected" ? "" : "rejected")}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-semibold uppercase text-slate-700">Recherche</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Client, fournisseur, n° facture…"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <FilterSelect
              label="Entreprise"
              value={filterEnterprise}
              onChange={setFilterEnterprise}
              options={[{ value: "", label: "Toutes" }, ...enterpriseOptions]}
            />
            {cabinetOptions.length > 0 && (
              <FilterSelect
                label="Cabinet"
                value={filterCabinet}
                onChange={setFilterCabinet}
                options={[{ value: "", label: "Tous" }, ...cabinetOptions]}
              />
            )}
            <FilterSelect
              label="Région"
              value={filterRegion}
              onChange={setFilterRegion}
              options={[
                { value: "", label: "Toutes" },
                ...regionOptions.map((r) => ({ value: r, label: regionDisplayLabel(r) })),
              ]}
            />
            <FilterSelect
              label="Devise"
              value={filterCurrency}
              onChange={setFilterCurrency}
              options={[
                { value: "", label: "Toutes" },
                ...currencyOptions.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterSelect
              label="Type"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: "", label: "Tous" },
                { value: "achat", label: "Achat" },
                { value: "vente", label: "Vente" },
              ]}
            />
            <div className="flex gap-1 pb-0.5">
              {isOwnerView && (
                <button
                  type="button"
                  onClick={() => setViewMode("cabinets")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    viewMode === "cabinets" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  Par cabinet
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  viewMode === "list" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800"
                }`}
              >
                Liste
              </button>
              {!isOwnerView && (
                <button
                  type="button"
                  onClick={() => setViewMode("enterprises")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    viewMode === "enterprises" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  Par entreprise
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Réinitialiser
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {filteredInvoices.length} facture(s) affichée(s)
            {hasActiveFilters ? ` sur ${allInvoices.length}` : ""}
          </p>
        </div>

        {Object.keys(totalsByCurrency).length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(totalsByCurrency).map(([code, t]) => (
              <div
                key={code}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-base">{code}</strong>
                  <span className="text-xs font-medium text-slate-600">{t.count} facture(s)</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                  {t.totalTTC.toFixed(2)} {invoiceCurrencySymbol(code)}
                  <span className="ml-2 text-sm font-normal text-slate-600">TTC</span>
                </p>
                {t.totalHT > 0 && (
                  <p className="text-sm text-slate-700">
                    HT {t.totalHT.toFixed(2)} {invoiceCurrencySymbol(code)}
                  </p>
                )}
                {(t.achatTTC > 0 || t.venteTTC > 0) && (
                  <p className="mt-1 text-xs font-medium text-slate-700">
                    Achat {t.achatTTC.toFixed(2)} · Vente {t.venteTTC.toFixed(2)} {invoiceCurrencySymbol(code)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {enterpriseOptions.length > 1 && !filterEnterprise && (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs font-medium text-slate-600">
              {enterpriseOptions.length} entreprise(s) cliente(s) :
            </span>
            {enterpriseOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilterEnterprise(value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:border-indigo-400 hover:bg-indigo-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {selected.size > 0 && !isOwnerView && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-300 bg-white px-3 py-2.5 shadow-md">
            <span className="text-sm font-semibold text-slate-900">{selected.size} sélectionnée(s)</span>
            <button
              type="button"
              onClick={selectPendingVisible}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
            >
              Sélect. à traiter
            </button>
            <button
              type="button"
              disabled={bulkBusy || selectedPending.length === 0}
              onClick={() => {
                setNoteModal({ ids: selectedPending.map((i) => i.id), action: "validated" });
                setReviewNote("");
              }}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              Valider ({selectedPending.length})
            </button>
            <button
              type="button"
              disabled={bulkBusy || selectedPending.length === 0}
              onClick={() => {
                setNoteModal({ ids: selectedPending.map((i) => i.id), action: "rejected" });
                setReviewNote("");
              }}
              className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              Rejeter ({selectedPending.length})
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs font-medium text-slate-700 underline"
            >
              Tout désélectionner
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
            Chargement…
          </div>
        ) : viewMode === "cabinets" && groupedByCabinet.length > 0 ? (
          <div className="space-y-3">
            {groupedByCabinet.map((group) => (
              <CabinetGroup
                key={group.email || group.label}
                group={group}
                selected={selected}
                busyId={busyId}
                readOnly={isOwnerView}
                onToggleSelect={toggleSelect}
                onDetail={setDetailInvoice}
                onReview={(id, action) => {
                  setNoteModal({ ids: [id], action });
                  setReviewNote("");
                }}
                onDownload={(inv) => void downloadFile(inv)}
              />
            ))}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
            {allInvoices.length === 0
              ? isOwnerView
                ? "Aucune facture enregistrée pour vos cabinets."
                : "Aucune facture transmise à ce cabinet pour le moment."
              : "Aucune facture ne correspond à ces filtres."}
          </div>
        ) : viewMode === "enterprises" ? (
          <div className="space-y-3">
            {groupedByEnterprise.map((group) => (
              <EnterpriseGroup
                key={group.label + (group.siret ?? "")}
                group={group}
                selected={selected}
                busyId={busyId}
                onToggleSelect={toggleSelect}
                onDetail={setDetailInvoice}
                onReview={(id, action) => {
                  setNoteModal({ ids: [id], action });
                  setReviewNote("");
                }}
                onDownload={(inv) => void downloadFile(inv)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[980px] text-left">
              <thead className="sticky top-0 z-20 border-b-2 border-slate-300 bg-slate-200 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-sm">
                <tr>
                  {!isOwnerView && (
                    <th className="w-8 bg-slate-200 px-2 py-3">
                      <input
                        type="checkbox"
                        checked={filteredInvoices.length > 0 && selected.size === filteredInvoices.length}
                        onChange={toggleSelectAll}
                        aria-label="Tout sélectionner"
                      />
                    </th>
                  )}
                  <th className="bg-slate-200 px-3 py-3">Entreprise</th>
                  <th className="bg-slate-200 px-3 py-3">Facture</th>
                  <th className="bg-slate-200 px-3 py-3">Type</th>
                  <th className="bg-slate-200 px-3 py-3 text-center">Devise</th>
                  <th className="bg-slate-200 px-3 py-3 text-right">HT</th>
                  <th className="bg-slate-200 px-3 py-3 text-right">TTC</th>
                  <th className="bg-slate-200 px-3 py-3">Revue</th>
                  <th className="bg-slate-200 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredInvoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    readOnly={isOwnerView}
                    selected={selected.has(inv.id)}
                    busy={busyId === inv.id}
                    onToggleSelect={() => toggleSelect(inv.id)}
                    onDetail={() => setDetailInvoice(inv)}
                    onReview={(action) => {
                      setNoteModal({ ids: [inv.id], action });
                      setReviewNote("");
                    }}
                    onDownload={() => void downloadFile(inv)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </main>

      {detailInvoice && (
        <DetailDrawer invoice={detailInvoice} onClose={() => setDetailInvoice(null)} authHeaders={authHeaders} />
      )}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              {noteModal.action === "validated"
                ? noteModal.ids.length > 1
                  ? `Valider ${noteModal.ids.length} factures`
                  : "Valider la facture"
                : noteModal.ids.length > 1
                  ? `Rejeter ${noteModal.ids.length} factures`
                  : "Rejeter la facture"}
            </h2>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Commentaire optionnel…"
              rows={3}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId !== "" || bulkBusy}
                onClick={() => void submitReview(noteModal.ids, noteModal.action, reviewNote)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
      >
        {options.map((o) => (
          <option key={o.value || "__all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald" | "rose";
  active?: boolean;
  onClick?: () => void;
}) {
  const colors =
    accent === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : accent === "emerald"
        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
        : accent === "rose"
          ? "border-rose-300 bg-rose-50 text-rose-950"
          : "border-slate-300 bg-white text-slate-950";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition ring-2 ${active ? "ring-indigo-600" : "ring-transparent hover:ring-slate-300"} ${colors}`}
    >
      <p className="text-xs font-semibold uppercase text-slate-700">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </button>
  );
}

function CurrencyBadge({ code }: { code: string | null | undefined }) {
  const c = (code ?? "EUR").toUpperCase();
  const styles: Record<string, string> = {
    EUR: "bg-blue-100 text-blue-950 ring-blue-300",
    GBP: "bg-violet-100 text-violet-950 ring-violet-300",
    USD: "bg-green-100 text-green-950 ring-green-300",
    CNY: "bg-red-100 text-red-950 ring-red-300",
    GHS: "bg-amber-100 text-amber-950 ring-amber-300",
    XAF: "bg-orange-100 text-orange-950 ring-orange-300",
    XOF: "bg-orange-100 text-orange-950 ring-orange-300",
  };
  const cls = styles[c] ?? "bg-slate-200 text-slate-950 ring-slate-400";
  return (
    <span className={`inline-flex min-w-[3.25rem] justify-center rounded-md px-2.5 py-1 text-sm font-bold ring-1 ${cls}`}>
      {c}
    </span>
  );
}

function AmountCell({
  amount,
  currency,
  emphasis,
}: {
  amount: number | null;
  currency: string | null | undefined;
  emphasis?: boolean;
}) {
  if (amount == null) {
    return <span className="text-base font-medium text-slate-400">—</span>;
  }
  const symbol = invoiceCurrencySymbol(currency);
  return (
    <div className={`text-right ${emphasis ? "rounded-lg bg-slate-900 px-2 py-1.5" : ""}`}>
      <span
        className={`block font-mono text-base font-bold tabular-nums tracking-tight ${
          emphasis ? "text-white" : "text-slate-900"
        }`}
      >
        {amount.toFixed(2)}
      </span>
      <span className={`block text-xs font-semibold ${emphasis ? "text-slate-300" : "text-slate-600"}`}>{symbol}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  if (type === "vente") {
    return <span className="rounded bg-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-950">Vente</span>;
  }
  if (type === "achat") {
    return <span className="rounded bg-violet-200 px-2 py-0.5 text-xs font-semibold text-violet-950">Achat</span>;
  }
  return <span className="text-sm text-slate-500">—</span>;
}

function ReviewBadge({ status, note }: { status: string | null; note: string | null }) {
  if (status === "validated") {
    return (
      <span
        className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-950"
        title={note ?? undefined}
      >
        Validée
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span
        className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-950"
        title={note ?? undefined}
      >
        Rejetée
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-950">À traiter</span>
  );
}

function InvoiceActions({
  inv,
  busy,
  onDetail,
  onReview,
  onDownload,
  compact,
  readOnly = false,
}: {
  inv: PortalInvoice;
  busy: boolean;
  onDetail: () => void;
  onReview: (action: ReviewAction) => void;
  onDownload: () => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const review = inv.accountantReviewStatus;
  return (
    <div className={`flex justify-end gap-1 ${compact ? "flex-wrap" : ""}`}>
      <button
        type="button"
        onClick={onDetail}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
      >
        Détail
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDownload}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
      >
        PDF
      </button>
      {inv.shareToken && (
        <Link
          href={`/share/${inv.shareToken}`}
          target="_blank"
          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          Voir
        </Link>
      )}
      {!readOnly && (
        <>
          <button
            type="button"
            disabled={busy || review === "validated"}
            onClick={() => onReview("validated")}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Valider
          </button>
          <button
            type="button"
            disabled={busy || review === "rejected"}
            onClick={() => onReview("rejected")}
            className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Rejeter
          </button>
        </>
      )}
    </div>
  );
}

function InvoiceRow({
  inv,
  selected,
  busy,
  onToggleSelect,
  onDetail,
  onReview,
  onDownload,
  readOnly = false,
}: {
  inv: PortalInvoice;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onDetail: () => void;
  onReview: (action: ReviewAction) => void;
  onDownload: () => void;
  readOnly?: boolean;
}) {
  const ttc = invoiceTTC(inv);
  return (
    <tr className="hover:bg-slate-50">
      {!readOnly && (
        <td className="px-2 py-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label="Sélectionner" />
        </td>
      )}
      <td className="px-3 py-2">
        <p className="font-semibold text-slate-900">{enterpriseLabel(inv)}</p>
        {inv.enterpriseSiret && <p className="text-xs text-slate-600">SIRET {inv.enterpriseSiret}</p>}
        <p className="text-xs text-slate-600">{clientLabel(inv)}</p>
        <p className="text-xs text-slate-500">{regionDisplayLabel(inv.region)}</p>
      </td>
      <td className="px-3 py-2">
        <button type="button" onClick={onDetail} className="text-left hover:underline">
          <p className="font-medium text-slate-800">{inv.fournisseur || inv.originalName}</p>
          <p className="text-xs text-slate-600">
            {inv.numeroFacture || "—"} · {formatDate(inv.invoiceDate ?? inv.createdAt)}
          </p>
        </button>
      </td>
      <td className="px-3 py-2">
        <TypeBadge type={inv.invoiceType} />
      </td>
      <td className="px-3 py-2.5 text-center">
        <CurrencyBadge code={inv.currency} />
      </td>
      <td className="px-3 py-2.5">
        <AmountCell amount={inv.montantHT} currency={inv.currency} />
      </td>
      <td className="px-3 py-2.5">
        <AmountCell amount={ttc} currency={inv.currency} emphasis />
      </td>
      <td className="px-3 py-2">
        <ReviewBadge status={inv.accountantReviewStatus} note={inv.accountantReviewNote} />
      </td>
      <td className="px-3 py-2">
        <InvoiceActions inv={inv} busy={busy} readOnly={readOnly} onDetail={onDetail} onReview={onReview} onDownload={onDownload} />
      </td>
    </tr>
  );
}

function CabinetGroup({
  group,
  selected,
  busyId,
  readOnly,
  onToggleSelect,
  onDetail,
  onReview,
  onDownload,
}: {
  group: { email: string; label: string; region: string; invoices: PortalInvoice[] };
  selected: Set<string>;
  busyId: string;
  readOnly?: boolean;
  onToggleSelect: (id: string) => void;
  onDetail: (inv: PortalInvoice) => void;
  onReview: (id: string, action: ReviewAction) => void;
  onDownload: (inv: PortalInvoice) => void;
}) {
  const [open, setOpen] = useState(true);
  const pending = group.invoices.filter((i) => !i.accountantReviewStatus).length;
  const totals = useMemo(() => {
    const byCur: Record<string, number> = {};
    for (const inv of group.invoices) {
      const c = inv.currency ?? "EUR";
      const ttc = invoiceTTC(inv);
      if (ttc != null) byCur[c] = (byCur[c] ?? 0) + ttc;
    }
    return byCur;
  }, [group.invoices]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div>
          <p className="font-semibold text-slate-900">{group.label}</p>
          {group.email && <p className="text-xs text-slate-600">{group.email}</p>}
          {group.region && (
            <p className="text-xs text-slate-500">{regionDisplayLabel(group.region)}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>{group.invoices.length} facture(s)</span>
          {pending > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
              {pending} en attente de revue cabinet
            </span>
          )}
          {Object.entries(totals).map(([code, sum]) => (
            <span key={code} className="font-mono text-slate-700">
              {sum.toFixed(2)} {invoiceCurrencySymbol(code)}
            </span>
          ))}
          <span className="text-slate-400">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {group.invoices.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">Aucune facture transmise à ce cabinet.</p>
          ) : (
            group.invoices.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-slate-50/80">
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={selected.has(inv.id)}
                  onChange={() => onToggleSelect(inv.id)}
                  aria-label="Sélectionner"
                />
              )}
              <div className="min-w-[140px] flex-1">
                <p className="text-xs font-medium text-slate-800">{inv.fournisseur || inv.originalName}</p>
                <p className="text-xs text-slate-600">
                  {inv.numeroFacture || "—"} · {formatDate(inv.invoiceDate)} · {formatDate(inv.sentAt)}
                </p>
                {readOnly && inv.enterpriseName && (
                  <p className="text-[10px] text-slate-500">{enterpriseLabel(inv)}</p>
                )}
              </div>
              <TypeBadge type={inv.invoiceType} />
              <CurrencyBadge code={inv.currency} />
              <AmountCell amount={invoiceTTC(inv)} currency={inv.currency} emphasis />
              <ReviewBadge status={inv.accountantReviewStatus} note={inv.accountantReviewNote} />
              <InvoiceActions
                inv={inv}
                busy={busyId === inv.id}
                readOnly={readOnly}
                compact
                onDetail={() => onDetail(inv)}
                onReview={(action) => onReview(inv.id, action)}
                onDownload={() => onDownload(inv)}
              />
            </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EnterpriseGroup({
  group,
  selected,
  busyId,
  onToggleSelect,
  onDetail,
  onReview,
  onDownload,
}: {
  group: { label: string; siret: string | null; contact: string | null; invoices: PortalInvoice[] };
  selected: Set<string>;
  busyId: string;
  onToggleSelect: (id: string) => void;
  onDetail: (inv: PortalInvoice) => void;
  onReview: (id: string, action: ReviewAction) => void;
  onDownload: (inv: PortalInvoice) => void;
}) {
  const [open, setOpen] = useState(true);
  const pending = group.invoices.filter((i) => !i.accountantReviewStatus).length;
  const totals = useMemo(() => {
    const byCur: Record<string, number> = {};
    for (const inv of group.invoices) {
      const c = inv.currency ?? "EUR";
      const ttc = invoiceTTC(inv);
      if (ttc != null) byCur[c] = (byCur[c] ?? 0) + ttc;
    }
    return byCur;
  }, [group.invoices]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div>
          <p className="font-semibold text-slate-900">{group.label}</p>
          {group.siret && <p className="text-xs text-slate-600">SIRET {group.siret}</p>}
          {group.contact && <p className="text-sm text-slate-600">{group.contact}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>{group.invoices.length} facture(s)</span>
          {pending > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
              {pending} à traiter
            </span>
          )}
          {Object.entries(totals).map(([code, sum]) => (
            <span key={code} className="font-mono text-slate-700">
              {sum.toFixed(2)} {invoiceCurrencySymbol(code)}
            </span>
          ))}
          <span className="text-slate-400">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {group.invoices.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-slate-50/80">
              <input
                type="checkbox"
                checked={selected.has(inv.id)}
                onChange={() => onToggleSelect(inv.id)}
                aria-label="Sélectionner"
              />
              <div className="min-w-[140px] flex-1">
                <p className="text-xs font-medium text-slate-800">{inv.fournisseur || inv.originalName}</p>
                <p className="text-xs text-slate-600">
                  {inv.numeroFacture || "—"} · {regionDisplayLabel(inv.region)} · {formatDate(inv.invoiceDate)}
                </p>
              </div>
              <TypeBadge type={inv.invoiceType} />
              <CurrencyBadge code={inv.currency} />
              <AmountCell amount={invoiceTTC(inv)} currency={inv.currency} emphasis />
              <ReviewBadge status={inv.accountantReviewStatus} note={inv.accountantReviewNote} />
              <InvoiceActions
                inv={inv}
                busy={busyId === inv.id}
                compact
                onDetail={() => onDetail(inv)}
                onReview={(action) => onReview(inv.id, action)}
                onDownload={() => onDownload(inv)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailDrawer({
  invoice,
  onClose,
  authHeaders,
}: {
  invoice: PortalInvoice;
  onClose: () => void;
  authHeaders: Record<string, string>;
}) {
  const ttc = invoiceTTC(invoice);

  const download = async () => {
    try {
      const res = await fetch(`/api/accountant-portal/invoices/${invoice.id}/file`, { headers: authHeaders });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoice.originalName || "facture";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Fermer" />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Détail facture</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <section>
            <p className="text-xs font-semibold uppercase text-slate-600">Entreprise cliente</p>
            <p className="font-semibold text-slate-900">{enterpriseLabel(invoice)}</p>
            {invoice.enterpriseSiret && <p className="text-sm text-slate-600">SIRET {invoice.enterpriseSiret}</p>}
            {invoice.structureName && !invoice.enterpriseName && (
              <p className="text-sm text-slate-600">Structure : {invoice.structureName}</p>
            )}
          </section>
          <section>
            <p className="text-xs font-semibold uppercase text-slate-600">Contact</p>
            <p className="font-medium">{clientLabel(invoice)}</p>
            {invoice.clientEmail && <p className="text-xs text-slate-500">{invoice.clientEmail}</p>}
          </section>
          <section className="grid grid-cols-2 gap-3">
            <Field label="Fournisseur" value={invoice.fournisseur || invoice.originalName} />
            <Field label="N° facture" value={invoice.numeroFacture} />
            <Field label="Date" value={formatDate(invoice.invoiceDate)} />
            <Field label="Région" value={regionDisplayLabel(invoice.region)} />
            <Field label="Type" value={invoice.invoiceType ?? "—"} />
            <Field label="Catégorie" value={invoice.category} />
            <Field label="Devise" value={invoice.currency ?? "EUR"} />
            <Field label="HT" value={invoice.montantHT != null ? formatInvoiceAmount(invoice.montantHT, invoice.currency) : null} />
            <Field label="TTC" value={ttc != null ? formatInvoiceAmount(ttc, invoice.currency) : null} />
            <Field label="Transmise" value={formatDate(invoice.sentAt)} />
          </section>
          <section>
            <p className="text-xs font-semibold uppercase text-slate-600">Revue cabinet</p>
            <div className="mt-1">
              <ReviewBadge status={invoice.accountantReviewStatus} note={invoice.accountantReviewNote} />
            </div>
            {invoice.accountantReviewNote && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{invoice.accountantReviewNote}</p>
            )}
            {invoice.accountantReviewedAt && (
              <p className="mt-1 text-sm text-slate-600">
                Revue le {formatDate(invoice.accountantReviewedAt)}
              </p>
            )}
          </section>
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => void download()}
            className="flex-1 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white"
          >
            Télécharger le fichier
          </button>
          {invoice.shareToken && (
            <Link
              href={`/share/${invoice.shareToken}`}
              target="_blank"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
            >
              Ouvrir
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-600">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value || "—"}</p>
    </div>
  );
}

export default function AccountantPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">Chargement…</div>
      }
    >
      <PortalContent />
    </Suspense>
  );
}
