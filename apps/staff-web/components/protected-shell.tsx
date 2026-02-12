"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useAuth } from "./auth-context";
import { useBranchScope } from "./branch-scope-context";

export const ProtectedShell = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, logout } = useAuth();
  const {
    branches,
    branchesLoading,
    canSwitchBranch,
    selectedBranchId,
    setSelectedBranchId,
  } = useBranchScope();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "loading") {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-500 font-medium">Oturum yükleniyor...</span>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated" || !user) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <span className="text-slate-500 font-medium">Giriş sayfasına yönlendiriliyorsunuz...</span>
      </main>
    );
  }

  const branchIsRequired =
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/services/disable");

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <span className="material-icons">content_cut</span>
            </div>
            <span className="text-xl font-bold tracking-tight">C-SPARK ADMIN</span>
          </div>
        </div>

        <nav className="flex-1 py-6">
          <ul className="space-y-1">
            <li>
              <Link
                href="/calendar"
                className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                  pathname.startsWith("/calendar")
                    ? "sidebar-item-active text-primary font-medium"
                    : "text-slate-500 hover:text-primary"
                }`}
              >
                <span className="material-icons">calendar_today</span>
                <span>Takvim</span>
              </Link>
            </li>
            <li>
              <Link
                href="/services/disable"
                className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                  pathname.startsWith("/services/disable")
                    ? "sidebar-item-active text-primary font-medium"
                    : "text-slate-500 hover:text-primary"
                }`}
              >
                <span className="material-icons">block</span>
                <span>Hizmet Devre Dışı</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl flex items-center gap-3 relative">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">{user.name}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                {user.role === "SUPER_ADMIN" ? "Süper Admin" : "Şube Yöneticisi"}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
              title="Çıkış Yap"
            >
              <span className="material-icons text-lg">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 flex-shrink-0">
          <div className="flex items-center gap-6">
            {canSwitchBranch ? (
              <div className="relative">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold absolute -top-2 left-3 bg-white dark:bg-slate-900 px-1">
                  Şube Seçiniz
                </label>
                <select
                  id="branch-switcher"
                  className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-sm font-medium focus:ring-primary focus:border-primary text-slate-900 dark:text-white appearance-none min-w-[200px]"
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  disabled={branchesLoading}
                >
                  <option value="">Şube seçiniz...</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                  <span className="material-icons text-base">expand_more</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Aktif Şube</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Şube: {user.branchId ?? "Bilinmiyor"}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Additional header actions could go here */}
          </div>
        </header>

        {/* Dynamic Warning for Branch Selection */}
        {canSwitchBranch && branchIsRequired && !selectedBranchId ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 px-8 py-3 text-sm flex items-center gap-3 font-medium flex-shrink-0">
            <span className="material-icons text-sm">warning</span>
            Lütfen işlem yapmadan önce bir şube seçiniz.
          </div>
        ) : null}

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
