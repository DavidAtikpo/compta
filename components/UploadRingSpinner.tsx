"use client";

/** Anneau de chargement pour envoi Cloudinary / traitement fichier (centrage libre). */
export function UploadRingSpinner({
  className = "h-12 w-12",
  trackClassName = "border-slate-200",
  spinClassName = "border-t-slate-800 border-r-slate-700/80",
  "aria-label": ariaLabel = "Chargement en cours",
}: {
  className?: string;
  trackClassName?: string;
  spinClassName?: string;
  "aria-label"?: string;
}) {
  const borderWidth = className.includes("h-3") || className.includes("h-4") ? "border-2" : "border-[3px]";
  return (
    <div
      className={`relative shrink-0 ${className}`}
      role="status"
      aria-label={ariaLabel}
    >
      <div className={`absolute inset-0 rounded-full ${borderWidth} ${trackClassName}`} />
      <div
        className={`absolute inset-0 rounded-full ${borderWidth} border-transparent ${spinClassName} motion-safe:animate-spin`}
        style={{ animationDuration: "0.85s" }}
      />
    </div>
  );
}
