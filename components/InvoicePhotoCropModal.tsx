"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImageFile } from "@/lib/crop-image";

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
  const [aspect, setAspect] = useState(3 / 4);
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
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setAspect(w / h);
    };
    img.src = imageSrc;
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <h2 id="crop-modal-title" className="text-sm font-semibold text-white">
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

      <p className="shrink-0 px-3 py-1.5 text-[11px] leading-snug text-slate-400">
        Déplacez et zoomez, puis validez pour enregistrer sur Cloudinary comme une facture.
      </p>

      <div className="relative min-h-0 w-full flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          cropShape="rect"
          showGrid
          restrictPosition={false}
        />
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-700 bg-slate-900 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-0 flex-1 accent-white"
          />
        </div>
        {err && <p className="text-center text-[11px] text-amber-300">{err}</p>}
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={busy || !croppedAreaPixels}
          className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Traitement…" : "Valider le recadrage"}
        </button>
      </div>
    </div>
  );
}
