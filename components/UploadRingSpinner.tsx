"use client";

/** Anneau de chargement pour envoi Cloudinary / traitement fichier (centrage libre). */
export function UploadRingSpinner({
  className = "h-12 w-12",
  "aria-label": ariaLabel = "Chargement en cours",
}: {
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      role="status"
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
      <div
        className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-slate-800 border-r-slate-700/80 motion-safe:animate-spin"
        style={{ animationDuration: "0.85s" }}
      />
    </div>
  );
}
