"use client";

import type { PublicBranch } from "@culturespark/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { publicApiClient } from "../lib/api";
import { useBookingFlow } from "../lib/booking-flow";
import { getFriendlyErrorMessage } from "../lib/booking-utils";

export default function CustomerHomePage() {
  const router = useRouter();
  const { state, actions } = useBookingFlow();
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    state.branchId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchBarTerm] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    publicApiClient
      .getPublicBranches({ size: 50, signal: controller.signal })
      .then((response) => {
        setBranches(response.items);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(getFriendlyErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  const filteredBranches = useMemo(() => {
    if (!searchTerm) return branches;
    return branches.filter((b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [branches, searchTerm]);

  return (
    <div className="min-h-screen flex justify-center bg-background-light dark:bg-background-dark">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-[480px] bg-white dark:bg-zinc-900 min-h-screen shadow-2xl flex flex-col relative overflow-hidden sm:my-4 sm:rounded-xl sm:min-h-[850px] sm:max-h-[850px] border border-primary/10">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-5 flex items-center justify-between border-b border-primary/10">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
              Şube Seçimi
            </h1>
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20">
            <img
              alt="User"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDA4gpvbBJw52Hg4k9DOntOk_9WdtsAObwfP1HxF18CmuEPPCUyQj5Jr4Y5WcEVhVsZp0agOn2ONU68RXkF_crsl__xXN6_L9yyN7_fIJCOGDLENjdW7t9kIgGwItnuV00joWuLIkPkhqWqjlwPVOJpZi3bTggh4GyuU7D7XqN9sfv6VxwyFgKoNZKvTtgosx_6GLCjxRgBHucoloqMrf5Ye83vbsF5u4yrqMUcVuzBoE4O5zS7oNSVpvDZ8xVfIE6zU7tMQvk8Wqjb"
            />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-32">
          {/* Intro Text */}
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Hoş Geldiniz!
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Hizmet almak istediğiniz şubeyi seçerek devam edin.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative group">
            <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="w-full pl-12 pr-4 py-3.5 bg-background-light dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-primary/40 text-sm text-zinc-800 dark:text-zinc-100 transition-all"
              placeholder="Şube ara..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchBarTerm(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
              {error}
            </div>
          )}

          {/* Branch List */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                Şubeler yükleniyor...
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Şube bulunamadı.
              </div>
            ) : (
              filteredBranches.map((branch) => (
                <label
                  key={branch.id}
                  className="relative block cursor-pointer group"
                >
                  <input
                    checked={selectedBranchId === branch.id}
                    className="hidden peer"
                    name="branch"
                    onChange={() => {
                      setSelectedBranchId(branch.id);
                    }}
                    type="radio"
                    value={branch.id}
                  />
                  <div className="p-4 rounded-xl border-2 border-transparent bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 transition-all peer-checked:border-primary peer-checked:ring-0 peer-checked:bg-primary/5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                        {branch.name}
                      </h3>
                      <span className="material-icons-round text-primary opacity-0 peer-checked:opacity-100 transition-opacity">
                        check_circle
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-4">
                      <span className="material-icons-round text-[16px] text-primary">
                        place
                      </span>
                      <span>{branch.id}</span>{" "}
                      {/* Using ID as address since it's not in PublicBranch */}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-700 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 flex items-center gap-1">
                        <span className="material-icons-round text-[14px]">
                          schedule
                        </span>{" "}
                        Şube seçimi
                      </span>
                      <span className="px-2 py-1 rounded bg-primary/20 text-[11px] font-bold text-green-700 dark:text-primary uppercase">
                        AÇIK
                      </span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </main>

        {/* Fixed Bottom Navigation */}
        <div className="absolute bottom-0 left-0 w-full p-6 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-primary/10 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] z-30">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest leading-none">
                Seçili Şube
              </span>
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {selectedBranch ? selectedBranch.name : "Seçilmedi"}
              </span>
            </div>
          </div>
          <button
            className="w-full bg-primary hover:bg-primary/90 text-zinc-900 font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedBranch}
            onClick={() => {
              if (!selectedBranch) {
                return;
              }

              actions.selectBranch({
                branchId: selectedBranch.id,
                branchName: selectedBranch.name,
              });
              router.push("/book/services");
            }}
            type="button"
          >
            Devam Et
            <span className="material-icons-round">arrow_forward</span>
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </div>
    </div>
  );
}
