"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/comptabilite/operations", label: "Opérations" },
  { href: "/comptabilite/banque", label: "Banque" },
  { href: "/comptabilite/pcg", label: "Plan comptable" },
  { href: "/comptabilite/tva", label: "TVA (CA3 / CA12)" },
] as const;

async function downloadFec() {
  const t = window.localStorage.getItem("compta-token");
  const res = await fetch("/api/export/fec", {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FEC_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComptabiliteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="px-3 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Comptabilité</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Opérations, import bancaire, plan comptable PCG et déclarations TVA.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadFec()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Export FEC
          </button>
        </div>

        <nav className="flex flex-wrap gap-2 border-b border-slate-100 pb-3" aria-label="Navigation comptabilité">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (item.href === "/comptabilite/operations" && pathname === "/comptabilite");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
