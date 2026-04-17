"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const token = window.localStorage.getItem("compta-token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.email) {
          setUserEmail(d.email);
          setUserName(d.name || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem("compta-token");
    router.replace("/login");
  };

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-slate-50">
      <Sidebar mobileOpen={mobileOpen} onNavigate={closeMobile} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setMobileOpen((o) => !o)}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">{children}</main>
        <footer className="shrink-0 border-t border-slate-200 bg-white py-2.5">
          <p className="px-4 text-center text-[11px] text-slate-400 lg:px-6">
            Compta IA — Optimisation fiscale basée sur la législation française &amp; internationale. Pour usage
            professionnel. Consultez votre expert-comptable.
          </p>
        </footer>
      </div>
    </div>
  );
}
