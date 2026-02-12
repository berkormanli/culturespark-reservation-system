"use client";

import type { PublicStaffOption } from "@culturespark/api-client";
import { StaffPreferenceMode } from "@culturespark/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { publicApiClient } from "../../../lib/api";
import { useBookingFlow } from "../../../lib/booking-flow";
import { getFriendlyErrorMessage } from "../../../lib/booking-utils";

export default function StaffPreferencePage() {
  const router = useRouter();
  const { state, actions } = useBookingFlow();
  const [staffOptions, setStaffOptions] = useState<PublicStaffOption[]>([]);
  const [preference, setPreference] = useState<StaffPreferenceMode>(
    state.preferenceType ?? StaffPreferenceMode.ANY,
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    state.requestedStaffId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.branchId) {
      router.replace("/");
      return;
    }
    if (state.serviceIds.length === 0) {
      router.replace("/book/services");
    }
  }, [router, state.branchId, state.serviceIds.length]);

  useEffect(() => {
    if (!state.branchId || state.serviceIds.length === 0) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    publicApiClient
      .getPublicBranchStaff({
        branchId: state.branchId,
        serviceIds: state.serviceIds,
        signal: controller.signal,
      })
      .then((response) => {
        setStaffOptions(response.items);
        setSelectedStaffId((existing) =>
          response.items.some((staff) => staff.id === existing) ? existing : "",
        );
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
  }, [state.branchId, state.serviceIds]);

  if (!state.branchId || state.serviceIds.length === 0) {
    return null;
  }

  const needsStaff = preference !== StaffPreferenceMode.ANY;

  return (
    <div className="min-h-screen flex justify-center bg-background-light dark:bg-background-dark">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 min-h-screen sm:min-h-[850px] sm:max-h-[850px] sm:my-4 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col relative border border-emerald-50 dark:border-neutral-800">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-6 py-5 flex items-center justify-between border-b border-emerald-50 dark:border-neutral-800">
          <button
            onClick={() => router.push("/book/services")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-background-light dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-primary/10 hover:text-primary transition-colors"
            type="button"
          >
            <span className="material-icons">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-neutral-800 dark:text-white">
            Personel Tercihi
          </h1>
          <div className="w-10" />
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          <div className="space-y-4">
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider text-xs">
              Nasıl Bir Tercih Yapmak İstersiniz?
            </p>
            <div className="grid gap-3">
              {[
                {
                  mode: StaffPreferenceMode.ANY,
                  label: "Farketmez",
                  sub: "Herhangi bir personel atanabilir",
                  icon: "shuffle",
                },
                {
                  mode: StaffPreferenceMode.PREFERRED,
                  label: "Tercih Ederim",
                  sub: "Belirli bir personeli önceliklendir",
                  icon: "star_outline",
                },
                {
                  mode: StaffPreferenceMode.REQUIRED,
                  label: "Zorunlu",
                  sub: "Sadece seçtiğim personelden hizmet alayım",
                  icon: "lock_outline",
                },
              ].map((option) => (
                <label
                  key={option.mode}
                  className="relative cursor-pointer group"
                >
                  <input
                    checked={preference === option.mode}
                    className="peer hidden"
                    name="preference"
                    onChange={() => setPreference(option.mode)}
                    type="radio"
                  />
                  <div className="p-4 rounded-xl border-2 border-transparent bg-background-light dark:bg-neutral-800 peer-checked:border-primary peer-checked:bg-primary/5 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                          <span className="material-icons">{option.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-neutral-800 dark:text-white">
                            {option.label}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {option.sub}
                          </p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white opacity-0 peer-checked:opacity-100" />
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {needsStaff && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider text-xs">
                  Personel Seçimi
                </p>
                <span className="text-xs text-primary font-bold">
                  {staffOptions.length} Personel Mevcut
                </span>
              </div>
              <div className="space-y-3">
                {loading ? (
                  <p className="text-neutral-500 text-sm py-4 text-center">
                    Yükleniyor...
                  </p>
                ) : staffOptions.length === 0 ? (
                  <p className="text-neutral-500 text-sm py-4 text-center">
                    Uygun personel bulunamadı.
                  </p>
                ) : (
                  staffOptions.map((staff) => (
                    <label
                      key={staff.id}
                      className="block relative group cursor-pointer"
                    >
                      <input
                        checked={selectedStaffId === staff.id}
                        className="peer hidden"
                        name="staff_select"
                        onChange={() => setSelectedStaffId(staff.id)}
                        type="radio"
                      />
                      <div className="flex items-center gap-4 p-3 rounded-lg border border-transparent peer-checked:border-primary/30 peer-checked:bg-primary/5 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden">
                            {staff.name.charAt(0)}
                          </div>
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-neutral-900 rounded-full" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-neutral-800 dark:text-white">
                            {staff.name}
                          </h4>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 text-[10px]">
                            Uzman Personel
                          </p>
                        </div>
                        <div className="peer-checked:block hidden">
                          <span className="material-icons text-primary">
                            check_circle
                          </span>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
              {error}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="sticky bottom-0 bg-white dark:bg-neutral-900 px-6 py-6 border-t border-emerald-50 dark:border-neutral-800">
          <button
            className="w-full bg-primary hover:bg-primary/90 text-neutral-900 font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={needsStaff && selectedStaffId.length === 0}
            onClick={() => {
              actions.setPreference(preference);
              if (needsStaff) {
                const selectedStaff = staffOptions.find(
                  (staff) => staff.id === selectedStaffId,
                );
                if (!selectedStaff) return;
                actions.setRequestedStaff({
                  requestedStaffId: selectedStaff.id,
                  requestedStaffName: selectedStaff.name,
                });
              } else {
                actions.clearRequestedStaff();
              }
              router.push("/book/time");
            }}
            type="button"
          >
            <span>Devam Et</span>
            <span className="material-icons">arrow_forward</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
