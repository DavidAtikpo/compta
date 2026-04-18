"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImageFile } from "@/lib/crop-image";
import "react-easy-crop/react-easy-crop.css";

/** Ratio type facture / reçu (éviter le ratio naturel très haut qui coupe les côtés au zoom). */
const CROP_ASPECT = 4 / 5;

type InvoicePhotoCropModalProps = {
  open: boolean;
  imageSrc: string | null;
  sourceFile: File | null;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void | Promise<void>;
};

export function InvoicePhotoCropModal({
  open,
  imageSrc,
  sourceFile,
  onCancel,
  onConfirm,
}: InvoicePhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !imageSrc) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setErr("");
    setBusy(false);
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const onCropComplete = useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !sourceFile || !croppedAreaPixels) {
      setErr("Ajustez légèrement le cadrage puis réessayez.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const out = await getCroppedImageFile(
        imageSrc,
        croppedAreaPixels,
        sourceFile.name,
        sourceFile.type || "image/jpeg",
      );
      await onConfirm(out);
    } catch (e) {
      setErr((e as Error).message || "Recadrage impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex h-dvh max-h-dvh flex-col bg-slate-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 px-3 py-2.5 sm:px-4">
        <h2 id="crop-modal-title" className="text-sm font-semibold text-white sm:text-base">
          Recadrer la photo
        </h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
        >
          Annuler
        </button>
      </div>

      <p className="shrink-0 px-3 py-2 text-[11px] leading-snug text-slate-400 sm:px-4 sm:text-xs">
        Pincez ou utilisez le curseur pour zoomer. Déplacez l’image pour garder toute la facture visible
        — le cadre garde un format document (4:5) pour limiter les bords coupés.
      </p>

      {/* Zone plus haute sur mobile pour mieux voir le recadrage */}
      <div className="relative min-h-[min(68dvh,620px)] w-full flex-1 sm:min-h-0 sm:flex-1 sm:max-h-[min(58vh,560px)]">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={0}
          aspect={CROP_ASPECT}
          minZoom={0.75}
          maxZoom={5}
          zoomSpeed={0.45}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          cropShape="rect"
          showGrid
          restrictPosition
          objectFit="contain"
          style={{
            containerStyle: {
              width: "100%",
              height: "100%",
              position: "relative",
            },
          }}
        />
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-700 bg-slate-900 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Zoom
          </span>
          <input
            type="range"
            min={0.75}
            max={5}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-0 flex-1 accent-white"
          />
          <span className="w-8 shrink-0 text-right text-[10px] text-slate-500">
            {zoom.toFixed(1)}×
          </span>
        </div>
        {err && <p className="text-center text-[11px] text-amber-300">{err}</p>}
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={busy || !croppedAreaPixels}
          className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3"
        >
          {busy ? "Traitement…" : "Valider le recadrage"}
        </button>
      </div>
    </div>
  );
}
