"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/": "Tableau de bord",
  "/invoices": "Factures",
  "/optimize": "Optimisation IA",
  "/history": "Historique",
  "/settings": "Paramètres",
};

type HeaderProps = {
  onMenuClick: () => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
};

export function Header({ onMenuClick, userName, userEmail, onLogout }: HeaderProps) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "Compta IA";
  const display = userName || userEmail || "…";

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm lg:h-12 lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <p className="truncate text-base font-semibold text-slate-900">{title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
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
