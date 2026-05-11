import Link from "next/link";

const nav = [
  { href: "/admin", label: "Vue globale" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/invoices", label: "Factures" },
  { href: "/admin/accountants", label: "Comptables" },
  { href: "/admin/structures", label: "Structures" },
  { href: "/admin/audit", label: "Audit" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Administration</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gestion et supervision de la plateforme.</p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Navigation admin">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}

