"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { regionDisplayLabel } from "@/lib/country-regions";

type InvoiceRow = {
  id: string;
  originalName: string;
  region: string;
  createdAt: string;
  fileUrl: string | null;
  mimeType?: string | null;
  folderId?: string | null;
};

type FolderRow = {
  id: string;
  name: string;
  fileCount?: number;
};

type FolderFilter = "all" | "none" | string;

function isLikelyImageFile(inv: InvoiceRow): boolean {
  const m = (inv.mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const u = (inv.fileUrl || "").toLowerCase();
  if (!u || u.includes("/raw/upload/")) return false;
  if (u.includes("/image/upload/") || u.includes("/image/authenticated/") || u.includes("/image/private/"))
    return true;
  if (u.includes("cloudinary.com") && u.includes("/image/")) return true;
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|#|$|\/)/i.test(u)) return true;
  return false;
}

function isLikelyPdf(inv: InvoiceRow): boolean {
  const m = (inv.mimeType || "").toLowerCase();
  if (m.includes("pdf")) return true;
  const u = inv.fileUrl || "";
  return /\.pdf(\?|#|$|\/)/i.test(u) || u.includes("/raw/");
}

function fileKind(inv: InvoiceRow): "pdf" | "image" | "autre" {
  if (isLikelyPdf(inv)) return "pdf";
  if (isLikelyImageFile(inv)) return "image";
  return "autre";
}

/** Miniature Cloudinary : 1re page PDF ou recadrage image ; sinon null. */
function cloudinaryThumbnailUrl(fileUrl: string, kind: "pdf" | "image" | "autre"): string | null {
  if (!fileUrl.includes("res.cloudinary.com")) return null;
  const imgT = "w_420,h_280,c_fill,g_north,q_auto,f_auto";
  const pdfT = "pg_1,w_420,h_280,c_fill,g_north,q_auto,f_jpg";

  if (kind === "pdf") {
    if (fileUrl.includes("/raw/upload/")) {
      return fileUrl.replace("/raw/upload/", `/image/upload/${pdfT}/`);
    }
    if (/\/image\/upload\//i.test(fileUrl) && /\.pdf($|\?|#)/i.test(fileUrl)) {
      return fileUrl.replace("/image/upload/", `/image/upload/${pdfT}/`);
    }
  }
  if (kind === "image" && /\/image\/upload\//i.test(fileUrl)) {
    return fileUrl.replace("/image/upload/", `/image/upload/${imgT}/`);
  }
  return null;
}

function thumbnailUrlForCard(inv: InvoiceRow, kind: "pdf" | "image" | "autre"): string | null {
  const fileUrl = inv.fileUrl;
  if (!fileUrl) return null;
  const c = cloudinaryThumbnailUrl(fileUrl, kind);
  if (c) return c;
  if (kind === "image") return fileUrl;
  return null;
}

function IconPdfMuted({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 13h8M8 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconImageMuted({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.25 2.25m-18-9.75h.008v.008H3V6.75Zm9.75 0h.008v.008h-.008V6.75Zm-9.75 0h.008v.008h-.008V6.75Z"
      />
    </svg>
  );
}

function BadgePdfFooter() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#e53935] text-[10px] font-bold uppercase leading-none tracking-tight text-white shadow-sm"
      aria-hidden
    >
      PDF
    </span>
  );
}

function BadgeImageFooter() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center bg-sky-600 text-[10px] font-bold uppercase leading-none tracking-tight text-white shadow-sm"
      aria-hidden
    >
      IMG
    </span>
  );
}

function BadgeFileFooter() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center bg-slate-500 text-[10px] font-bold uppercase leading-none tracking-tight text-white shadow-sm"
      aria-hidden
    >
      FIC
    </span>
  );
}

/** Coin inférieur droit type page pliée (gris + accent orange). */
function FoldedCorner() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 right-0 z-[1] h-[15px] w-[15px]"
      aria-hidden
    >
      <div className="absolute bottom-0 right-0 h-0 w-0 border-b-[15px] border-l-[15px] border-b-slate-400 border-l-transparent" />
      <div className="absolute bottom-px right-px h-0 w-0 border-b-[8px] border-l-[8px] border-b-orange-500 border-l-transparent" />
    </div>
  );
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("compta-token");
}

async function fetchInvoiceFileBlob(id: string, token: string): Promise<{ blob: Blob; fileName: string } | null> {
  try {
    const fileRes = await fetch(`/api/invoices/${id}/file?disposition=inline`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const contentType = fileRes.headers.get("content-type") || "";
    if (fileRes.ok && contentType.includes("application/json")) {
      const data = (await fileRes.json()) as { url?: string };
      if (typeof data.url !== "string") return null;
      const remote = await fetch(data.url);
      if (!remote.ok) return null;
      const blob = await remote.blob();
      return { blob, fileName: "fichier" };
    }
    if (fileRes.ok) {
      const blob = await fileRes.blob();
      return { blob, fileName: "fichier" };
    }
    return null;
  } catch {
    return null;
  }
}

function InvoiceFileCard({
  inv,
  onOpen,
  onRename,
  onDelete,
  deleting,
}: {
  inv: InvoiceRow;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const k = fileKind(inv);
  const thumb = thumbnailUrlForCard(inv, k);
  const [imgError, setImgError] = useState(false);
  const showThumb = Boolean(thumb && !imgError);

  const label =
    k === "pdf" ? `PDF — ${inv.originalName}` : k === "image" ? `Image — ${inv.originalName}` : `Fichier — ${inv.originalName}`;

  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ouvrir ${label}`}
        className="relative block w-full text-left"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-200">
          {showThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatures dynamiques (Cloudinary / URL directe)
            <img
              src={thumb!}
              alt=""
              className="h-full w-full object-cover object-top"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200/90">
              {k === "pdf" ? (
                <IconPdfMuted className="h-14 w-14 text-slate-300" />
              ) : k === "image" ? (
                <IconImageMuted className="h-14 w-14 text-slate-300" />
              ) : (
                <IconPdfMuted className="h-12 w-12 text-slate-300 opacity-60" />
              )}
            </div>
          )}
        </div>
      </button>

      <div className="relative flex min-h-[48px] items-center gap-2 border-t border-slate-200/80 bg-slate-100 px-2.5 py-2 pr-5">
        {k === "pdf" ? <BadgePdfFooter /> : k === "image" ? <BadgeImageFooter /> : <BadgeFileFooter />}
        <button
          type="button"
          onClick={onRename}
          title="Renommer la pièce jointe"
          className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-slate-700 hover:text-indigo-800"
        >
          {inv.originalName}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          disabled={deleting}
          className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
          aria-label={`Renommer ${inv.originalName}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={deleting}
          className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
          aria-label={`Supprimer ${inv.originalName}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      <FoldedCorner />
    </div>
  );
}

export default function FichiersPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"tous" | "pdf" | "image">("tous");
  const [preview, setPreview] = useState<InvoiceRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewBlobRef = useRef<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewKind, setPreviewKind] = useState<"pdf" | "image" | "autre">("autre");
  const [renameTarget, setRenameTarget] = useState<InvoiceRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [createFolderSaving, setCreateFolderSaving] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [moveSavingId, setMoveSavingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current);
        previewBlobRef.current = null;
      }
    };
  }, []);

  const loadFolders = useCallback(async (token: string | null) => {
    if (!token) {
      setFolders([]);
      setUncategorizedCount(0);
      return;
    }
    try {
      const res = await fetch("/api/invoice-folders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { folders?: FolderRow[]; uncategorizedCount?: number };
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setUncategorizedCount(typeof data.uncategorizedCount === "number" ? data.uncategorizedCount : 0);
    } catch {
      setFolders([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = getToken();
      const [invRes] = await Promise.all([
        fetch("/api/invoices?limit=2000", {
          headers: t ? { Authorization: `Bearer ${t}` } : {},
        }),
        loadFolders(t),
      ]);
      if (!invRes.ok) return;
      const data = (await invRes.json()) as InvoiceRow[];
      setRows(data.filter((r) => r.fileUrl));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadFolders]);

  useEffect(() => {
    load();
  }, [load]);

  const rowsInFolder = useMemo(() => {
    if (folderFilter === "all") return rows;
    if (folderFilter === "none") return rows.filter((r) => !r.folderId);
    return rows.filter((r) => r.folderId === folderFilter);
  }, [rows, folderFilter]);

  const filtered = useMemo(() => {
    if (filter === "tous") return rowsInFolder;
    if (filter === "pdf") return rowsInFolder.filter((r) => fileKind(r) === "pdf");
    return rowsInFolder.filter((r) => fileKind(r) === "image");
  }, [rowsInFolder, filter]);

  const totalFileCount = rows.length;

  const openPreview = async (inv: InvoiceRow) => {
    const token = getToken();
    if (!token) return;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      previewBlobRef.current = null;
      return null;
    });
    setPreview(inv);
    setPreviewKind(fileKind(inv));
    setPreviewLoading(true);
    const got = await fetchInvoiceFileBlob(inv.id, token);
    setPreviewLoading(false);
    if (!got) return;
    const kind = got.blob.type.includes("pdf")
      ? "pdf"
      : got.blob.type.startsWith("image/")
        ? "image"
        : "autre";
    setPreviewKind(kind);
    const url = URL.createObjectURL(got.blob);
    previewBlobRef.current = url;
    setPreviewUrl(url);
  };

  const closePreview = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      previewBlobRef.current = null;
      return null;
    });
    setPreview(null);
  };

  const openRenameDialog = (inv: InvoiceRow) => {
    setRenameError(null);
    setRenameTarget(inv);
    setRenameValue(inv.originalName);
  };

  const handleSaveOriginalName = async (inv: InvoiceRow, name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === inv.originalName) return false;
    const t = getToken();
    if (!t) {
      setRenameError("Connexion requise.");
      return false;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ id: inv.id, originalName: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setRenameError(typeof err.error === "string" ? err.error : "Erreur lors du renommage.");
        return false;
      }
      setRows((prev) => prev.map((r) => (r.id === inv.id ? { ...r, originalName: trimmed } : r)));
      setPreview((p) => (p?.id === inv.id ? { ...p, originalName: trimmed } : p));
      return true;
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async (inv: InvoiceRow) => {
    if (
      !window.confirm(
        `Supprimer la facture « ${inv.originalName} » et sa pièce jointe ?\nLa fiche disparaîtra aussi de la page Factures. Action irréversible.`,
      )
    ) {
      return;
    }
    const t = getToken();
    if (!t) {
      alert("Connexion requise.");
      return;
    }
    setDeletingId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(typeof data.error === "string" ? data.error : "Erreur lors de la suppression.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== inv.id));
      if (preview?.id === inv.id) closePreview();
    } catch {
      alert("Erreur réseau lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateFolder = async () => {
    const name = createFolderName.trim();
    if (!name) return;
    const t = getToken();
    if (!t) {
      setCreateFolderError("Connexion requise.");
      return;
    }
    setCreateFolderSaving(true);
    setCreateFolderError(null);
    try {
      const res = await fetch("/api/invoice-folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setCreateFolderError(typeof err.error === "string" ? err.error : "Erreur création dossier.");
        return;
      }
      const created = (await res.json()) as FolderRow;
      setCreateFolderOpen(false);
      setCreateFolderName("");
      await loadFolders(t);
      setFolderFilter(created.id);
    } finally {
      setCreateFolderSaving(false);
    }
  };

  const handleRenameFolder = async (folder: FolderRow) => {
    const next = window.prompt("Nouveau nom du dossier :", folder.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === folder.name) return;
    const t = getToken();
    if (!t) {
      alert("Connexion requise.");
      return;
    }
    const res = await fetch(`/api/invoice-folders/${folder.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(typeof err.error === "string" ? err.error : "Erreur renommage.");
      return;
    }
    await loadFolders(t);
  };

  const handleDeleteFolder = async (folder: FolderRow) => {
    if (
      !window.confirm(
        `Supprimer le dossier « ${folder.name} » ?\nLes pièces jointes restent enregistrées (sans dossier).`,
      )
    ) {
      return;
    }
    const t = getToken();
    if (!t) {
      alert("Connexion requise.");
      return;
    }
    const res = await fetch(`/api/invoice-folders/${folder.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(typeof err.error === "string" ? err.error : "Erreur suppression dossier.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.folderId === folder.id ? { ...r, folderId: null } : r)));
    if (folderFilter === folder.id) setFolderFilter("all");
    await loadFolders(t);
  };

  const handleMoveInvoice = async (inv: InvoiceRow, newFolderId: string | null) => {
    const current = inv.folderId ?? null;
    if (current === newFolderId) return;
    const t = getToken();
    if (!t) {
      alert("Connexion requise.");
      return;
    }
    setMoveSavingId(inv.id);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ id: inv.id, folderId: newFolderId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(typeof err.error === "string" ? err.error : "Impossible de déplacer la facture.");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === inv.id ? { ...r, folderId: newFolderId } : r)));
      setPreview((p) => (p?.id === inv.id ? { ...p, folderId: newFolderId } : p));
      await loadFolders(t);
    } finally {
      setMoveSavingId(null);
    }
  };

  const folderSelect = (inv: InvoiceRow, compact?: boolean) => (
    <label className={compact ? "inline-flex items-center gap-1" : "mt-2 block text-[10px] sm:text-xs"}>
      {!compact && <span className="mb-1 block font-medium text-slate-600">Dossier</span>}
      <select
        value={inv.folderId ?? ""}
        disabled={moveSavingId === inv.id}
        onChange={(e) => {
          const v = e.target.value;
          void handleMoveInvoice(inv, v === "" ? null : v);
        }}
        onClick={(e) => e.stopPropagation()}
        className={
          compact
            ? "max-w-[140px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700"
            : "w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
        }
      >
        <option value="">Sans dossier</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Pièces jointes</h1>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-sm">
            Galerie visuelle des PDF et images enregistrés sur vos factures. Pour la saisie et l&apos;OCR, utilisez la page Factures.
          </p>
          <Link
            href="/invoices"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 hover:text-indigo-900 sm:text-xs"
          >
            → Gérer les factures (OCR, devises)
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:w-56">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dossiers</span>
              <button
                type="button"
                onClick={() => {
                  setCreateFolderError(null);
                  setCreateFolderName("");
                  setCreateFolderOpen(true);
                }}
                className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800 sm:text-xs"
              >
                + Nouveau
              </button>
            </div>
            <nav className="space-y-0.5" aria-label="Dossiers">
              <button
                type="button"
                onClick={() => setFolderFilter("all")}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                  folderFilter === "all" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">Toutes les pièces</span>
                <span className="ml-2 tabular-nums text-slate-400">{totalFileCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setFolderFilter("none")}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                  folderFilter === "none" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">Sans dossier</span>
                <span className="ml-2 tabular-nums text-slate-400">{uncategorizedCount}</span>
              </button>
              {folders.map((f) => (
                <div
                  key={f.id}
                  className={`group flex items-center gap-0.5 rounded-lg pr-0.5 ${
                    folderFilter === f.id ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setFolderFilter(f.id)}
                    className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs ${
                      folderFilter === f.id ? "font-medium text-slate-900" : "text-slate-600"
                    }`}
                  >
                    {f.name}
                    <span className="ml-1 tabular-nums text-slate-400">{f.fileCount ?? 0}</span>
                  </button>
                  <button
                    type="button"
                    title="Renommer"
                    onClick={() => void handleRenameFolder(f)}
                    className="rounded p-1 text-slate-400 opacity-0 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Renommer ${f.name}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Supprimer le dossier"
                    onClick={() => void handleDeleteFolder(f)}
                    className="rounded p-1 text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Supprimer ${f.name}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["tous", "pdf", "image"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition sm:text-xs ${
                filter === k
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {k === "tous" ? "Tous" : k === "pdf" ? "PDF" : "Images"}
              <span className="ml-1 tabular-nums opacity-80">
                (
                {k === "tous"
                  ? rowsInFolder.length
                  : k === "pdf"
                    ? rowsInFolder.filter((r) => fileKind(r) === "pdf").length
                    : rowsInFolder.filter((r) => fileKind(r) === "image").length}
                )
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => load()}
            className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100 sm:text-xs"
          >
            Actualiser
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="aspect-[4/3] animate-pulse bg-slate-200" />
                <div className="flex h-12 items-center gap-2 border-t border-slate-200 bg-slate-100 px-2.5">
                  <div className="h-9 w-9 animate-pulse bg-slate-300" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-slate-300" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
            Aucune pièce jointe pour ce filtre ou ce dossier. Importez des factures depuis la page{" "}
            <Link href="/invoices" className="font-medium text-blue-600 hover:underline">
              Factures
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-1">
                <InvoiceFileCard
                  inv={inv}
                  onOpen={() => void openPreview(inv)}
                  onRename={() => openRenameDialog(inv)}
                  onDelete={() => void handleDelete(inv)}
                  deleting={deletingId === inv.id}
                />
                <div className="px-0.5">{folderSelect(inv, true)}</div>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
          onClick={closePreview}
        >
          <div
            className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="min-w-0">
                <h2 id="preview-title" className="truncate text-sm font-semibold text-slate-900">
                  {preview.originalName}
                </h2>
                <p className="text-[10px] text-slate-500 sm:text-xs">
                  {regionDisplayLabel(preview.region)}
                </p>
                {folderSelect(preview)}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openRenameDialog(preview)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 sm:text-xs"
                >
                  Renommer
                </button>
                <button
                  type="button"
                  disabled={deletingId === preview.id}
                  onClick={() => void handleDelete(preview)}
                  className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:text-xs"
                >
                  {deletingId === preview.id ? "Suppression…" : "Supprimer"}
                </button>
                <Link
                  href="/invoices"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 sm:text-xs"
                  onClick={closePreview}
                >
                  Factures
                </Link>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Fermer"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-2 sm:p-4">
              {previewLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">Chargement…</div>
              ) : previewUrl ? (
                previewKind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={preview.originalName}
                    className="mx-auto max-h-[70dvh] w-auto max-w-full object-contain"
                  />
                ) : (
                  <iframe title={preview.originalName} src={previewUrl} className="h-[70dvh] w-full rounded-lg border-0 bg-white" />
                )
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Impossible d&apos;afficher l&apos;aperçu (téléchargez depuis{" "}
                  <Link href="/invoices" className="text-blue-600 underline">
                    Factures
                  </Link>
                  ).
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {createFolderOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-folder-title"
          onClick={() => !createFolderSaving && setCreateFolderOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-folder-title" className="text-base font-semibold text-slate-900">
              Nouveau dossier
            </h2>
            <p className="mt-1 text-xs text-slate-500">Classez vos pièces jointes par client, période, etc.</p>
            <input
              type="text"
              value={createFolderName}
              onChange={(e) => setCreateFolderName(e.target.value)}
              maxLength={255}
              autoFocus
              placeholder="Ex. CEET 2026"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !createFolderSaving && createFolderName.trim()) {
                  void handleCreateFolder();
                }
              }}
            />
            {createFolderError && <p className="mt-2 text-xs text-red-600">{createFolderError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={createFolderSaving}
                onClick={() => setCreateFolderOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={createFolderSaving || !createFolderName.trim()}
                onClick={() => void handleCreateFolder()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {createFolderSaving ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-file-title"
          onClick={() => !renameSaving && setRenameTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rename-file-title" className="text-base font-semibold text-slate-900">
              Renommer la pièce jointe
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Nom affiché ici et sur la page Factures. Le fichier sur Cloudinary garde la même URL.
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={255}
              autoFocus
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !renameSaving) {
                  void handleSaveOriginalName(renameTarget, renameValue).then((ok) => {
                    if (ok) setRenameTarget(null);
                  });
                }
              }}
            />
            {renameError && <p className="mt-2 text-xs text-red-600">{renameError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={renameSaving}
                onClick={() => setRenameTarget(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={renameSaving || !renameValue.trim()}
                onClick={() => {
                  void handleSaveOriginalName(renameTarget, renameValue).then((ok) => {
                    if (ok) setRenameTarget(null);
                  });
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {renameSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
