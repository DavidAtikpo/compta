"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SessionExpiredRedirect } from "@/components/SessionExpiredRedirect";
import { Sidebar } from "@/components/Sidebar";
import { isEntreprisePlan } from "@/lib/plans";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userImageUrl, setUserImageUrl] = useState("");
  const [showEnterpriseNav, setShowEnterpriseNav] = useState(false);
  const [showAdminNav, setShowAdminNav] = useState(false);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const token = window.localStorage.getItem("compta-token");
      if (!token) {
        setShowEnterpriseNav(false);
        setShowAdminNav(false);
        setOrganizationName(null);
        return;
      }
      void (async () => {
        try {
          const [meRes, entRes] = await Promise.all([
            fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/enterprise", { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          const me = await meRes.json().catch(() => ({}));
          const ent = await entRes.json().catch(() => ({}));
          if (meRes.ok && me.email) {
            setUserEmail(me.email);
            setUserName(typeof me.name === "string" ? me.name : "");
            setUserImageUrl(typeof me.imageUrl === "string" ? me.imageUrl : "");
            setShowAdminNav(!!me.isAdmin);
            // Plan utilisateur OU plan du propriétaire (membre invité / fallback API entreprise)
            setShowEnterpriseNav(
              isEntreprisePlan(me.billingPlan) || isEntreprisePlan(ent?.ownerBillingPlan),
            );
            const entName =
              ent?.enterprise && typeof ent.enterprise.name === "string" ? ent.enterprise.name.trim() : "";
            setOrganizationName(entName || null);
          }
        } catch {
          /* silent */
        }
      })();
    };
    load();
    window.addEventListener("compta-profile-updated", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("compta-profile-updated", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem("compta-token");
    router.replace("/login");
  };

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <SessionExpiredRedirect />
      <Sidebar showEnterpriseNav={showEnterpriseNav} showAdminNav={showAdminNav} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          userName={userName}
          userEmail={userEmail}
          userImageUrl={userImageUrl || undefined}
          onLogout={handleLogout}
          teamWorkspaceActive={showEnterpriseNav}
          organizationName={organizationName}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          {children}
        </main>
        <footer className="hidden shrink-0 border-t border-slate-200 bg-white py-2.5 lg:block">
          <p className="px-4 text-center text-[11px] text-slate-400 lg:px-6">
            Compta IA — Optimisation fiscale basée sur la législation française &amp; internationale. Pour usage
            professionnel. Consultez votre expert-comptable.
          </p>
        </footer>
      </div>
      <MobileBottomNav showEnterpriseNav={showEnterpriseNav} showAdminNav={showAdminNav} />
    </div>
  );
}
