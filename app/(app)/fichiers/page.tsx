"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { regionDisplayLabel } from "@/lib/country-regions";

type InvoiceRow = {
  id: string;
  originalName: string;
  region: string;
  createdAt: string;
  fileUrl: string | null;
  mimeType?: string | null;
};

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

function InvoiceFileCard({ inv, onOpen }: { inv: InvoiceRow; onOpen: () => void }) {
  const k = fileKind(inv);
  const thumb = thumbnailUrlForCard(inv, k);
  const [imgError, setImgError] = useState(false);
  const showThumb = Boolean(thumb && !imgError);

  const label =
    k === "pdf" ? `PDF — ${inv.originalName}` : k === "image" ? `Image — ${inv.originalName}` : `Fichier — ${inv.originalName}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="group relative flex w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
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

      <div className="relative flex min-h-[48px] items-center gap-2 border-t border-slate-200/80 bg-slate-100 px-2.5 py-2 pr-5">
        {k === "pdf" ? <BadgePdfFooter /> : k === "image" ? <BadgeImageFooter /> : <BadgeFileFooter />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700" title={inv.originalName}>
          {inv.originalName}
        </span>
      </div>

      <FoldedCorner />
    </button>
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

  useEffect(() => {
    return () => {
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current);
        previewBlobRef.current = null;
      }
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = getToken();
      const res = await fetch("/api/invoices?limit=2000", {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (!res.ok) return;
      const data = (await res.json()) as InvoiceRow[];
      setRows(data.filter((r) => r.fileUrl));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered =
    filter === "tous"
      ? rows
      : filter === "pdf"
        ? rows.filter((r) => fileKind(r) === "pdf")
        : rows.filter((r) => fileKind(r) === "image");

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

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Fichiers des factures</h1>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-sm">
            PDF et captures images enregistrés sur vos factures. Cliquez sur une carte pour prévisualiser.
          </p>
        </div>

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
                  ? rows.length
                  : k === "pdf"
                    ? rows.filter((r) => fileKind(r) === "pdf").length
                    : rows.filter((r) => fileKind(r) === "image").length}
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
            Aucune pièce jointe pour ce filtre. Importez des factures depuis la page{" "}
            <Link href="/invoices" className="font-medium text-blue-600 hover:underline">
              Factures
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {filtered.map((inv) => (
              <InvoiceFileCard key={inv.id} inv={inv} onOpen={() => void openPreview(inv)} />
            ))}
          </div>
        )}
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
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
    </div>
  );
}
