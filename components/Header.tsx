"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/": "Tableau de bord",
  "/invoices": "Factures",
  "/fichiers": "Fichiers",
  "/optimize": "Optimisation IA",
  "/history": "Historique",
  "/settings": "Paramètres",
};

type HeaderProps = {
  userName: string;
  userEmail: string;
  userImageUrl?: string;
  onLogout: () => void;
};

export function Header({ userName, userEmail, userImageUrl, onLogout }: HeaderProps) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "Compta IA";
  const isOptimize = pathname === "/optimize";
  const display = userName || userEmail || "…";
  const initial = (userName || userEmail || "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm lg:h-12 lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{title}</p>
          {isOptimize && (
            <p className="hidden truncate text-[11px] text-slate-500 lg:block">
              IA specialisee en fiscalite - baremes et dispositifs ; alertes JO, data.gouv et Judilibre (PISTE) si configure
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        {isOptimize && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("compta-open-alerts"));
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            title="Alertes loi"
          >
            Alertes loi
          </button>
        )}
        {userImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userImageUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
          />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600"
            aria-hidden
          >
            {initial}
          </span>
        )}
        <span className="hidden max-w-[10rem] truncate text-xs text-slate-500 sm:inline" title={userEmail}>
          {display}
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
