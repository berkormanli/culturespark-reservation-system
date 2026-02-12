"use client";

import type { PublicAvailabilitySlot } from "@culturespark/api-client";
import { StaffPreferenceMode } from "@culturespark/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { publicApiClient } from "../../../lib/api";
import { useBookingFlow } from "../../../lib/booking-flow";
import {
  formatSlotDateTime,
  formatSlotTime,
  getFriendlyErrorMessage,
  getTodayInIstanbul,
  isSlotAlignedToInterval,
} from "../../../lib/booking-utils";

export default function DateTimeSelectPage() {
  const router = useRouter();
  const { state, actions } = useBookingFlow();
  const [date, setDate] = useState(state.date ?? getTodayInIstanbul());
  const [slots, setSlots] = useState<PublicAvailabilitySlot[]>([]);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState<number | null>(
    state.slotIntervalMinutes,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<PublicAvailabilitySlot | null>(
    null,
  );

  const requiresStaff =
    state.preferenceType === StaffPreferenceMode.PREFERRED ||
    state.preferenceType === StaffPreferenceMode.REQUIRED;

  useEffect(() => {
    if (!state.branchId) {
      router.replace("/");
      return;
    }
    if (state.serviceIds.length === 0) {
      router.replace("/book/services");
      return;
    }
    if (!state.preferenceType) {
      router.replace("/book/staff");
      return;
    }
    if (requiresStaff && !state.requestedStaffId) {
      router.replace("/book/staff");
    }
  }, [
    requiresStaff,
    router,
    state.branchId,
    state.preferenceType,
    state.requestedStaffId,
    state.serviceIds.length,
  ]);

  useEffect(() => {
    if (!state.branchId || !state.preferenceType) {
      return;
    }

    if (requiresStaff && !state.requestedStaffId) {
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);
    publicApiClient
      .getPublicAvailability({
        branchId: state.branchId,
        serviceIds: state.serviceIds,
        date,
        preferenceType: state.preferenceType,
        ...(state.requestedStaffId
          ? { requestedStaffId: state.requestedStaffId }
          : {}),
        signal: controller.signal,
      })
      .then((response) => {
        setSlotIntervalMinutes(response.slotIntervalMinutes);
        setSlots(
          response.slots.filter((slot) =>
            isSlotAlignedToInterval(
              slot.startsAt,
              response.slotIntervalMinutes,
            ),
          ),
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
  }, [
    date,
    requiresStaff,
    state.branchId,
    state.preferenceType,
    state.requestedStaffId,
    state.serviceIds,
  ]);

  const selectedStartsAt = useMemo(
    () => state.selectedStartsAt,
    [state.selectedStartsAt],
  );

  if (
    !state.branchId ||
    state.serviceIds.length === 0 ||
    !state.preferenceType ||
    (requiresStaff && !state.requestedStaffId)
  ) {
    return null;
  }

  const confirmSlot = (
    slot: PublicAvailabilitySlot,
    allowAlternateStaff: boolean,
  ) => {
    if (!slotIntervalMinutes) {
      return;
    }

    actions.setDate(date);
    actions.setAllowAlternateStaff(allowAlternateStaff);
    actions.selectSlot({
      startsAt: slot.startsAt,
      slotIntervalMinutes,
    });
    router.push("/book/details");
  };

  // Generate next 7 days for the date scroller
  const dateOptions = useMemo(() => {
    const options: {
      iso: string;
      dayName: string;
      dayNum: number;
      monthName: string;
    }[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split("T")[0] as string;
      const dayName = new Intl.DateTimeFormat("tr-TR", {
        weekday: "short",
      }).format(d);
      const dayNum = d.getDate();
      const monthName = new Intl.DateTimeFormat("tr-TR", {
        month: "short",
      }).format(d);
      options.push({ iso, dayName, dayNum, monthName });
    }
    return options;
  }, []);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Header Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-primary/10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push("/book/staff")}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-primary/10 transition-colors"
            type="button"
          >
            <span className="material-icons text-slate-600 dark:text-slate-300">
              arrow_back
            </span>
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold">Randevu Al</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {state.branchName}
            </p>
          </div>
          <div className="w-10" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {/* Progress Steps (Visual only) */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-1.5 w-8 rounded-full bg-primary" />
          <div className="h-1.5 w-12 rounded-full bg-primary" />
          <div className="h-1.5 w-8 rounded-full bg-primary" />
          <div className="h-1.5 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Date Scroller Section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 px-1">
            Tarih Seçin
          </h2>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
            {dateOptions.map((opt) => {
              const isSelected = date === opt.iso;
              return (
                <button
                  key={opt.iso}
                  onClick={() => {
                    setDate(opt.iso);
                    actions.setDate(opt.iso);
                  }}
                  className={`flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? "bg-primary shadow-lg shadow-primary/20"
                      : "bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-primary/10 hover:border-primary/50"
                  }`}
                  type="button"
                >
                  <span
                    className={`text-[10px] font-bold uppercase ${isSelected ? "text-slate-900/60" : "text-slate-400"}`}
                  >
                    {opt.dayName}
                  </span>
                  <span
                    className={`text-xl font-bold ${isSelected ? "text-slate-900" : "text-slate-700 dark:text-slate-200"}`}
                  >
                    {opt.dayNum}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase ${isSelected ? "text-slate-900/60" : "text-slate-400"}`}
                  >
                    {opt.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Slots Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saat Seçin
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                <span className="text-[11px] font-medium text-slate-500">
                  Tercih Edilen
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span className="text-[11px] font-medium text-slate-500">
                  Diğer
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Saatler yükleniyor...
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {slots.length === 0 ? (
                <p className="text-gray-500 text-center py-8 col-span-full">
                  Bu tarih için uygun randevu saati bulunamadı.
                </p>
              ) : (
                slots.map((slot) => {
                  const isSelected = selectedStartsAt === slot.startsAt;
                  const preferredAvailable =
                    slot.preferredStaffAvailable === true ||
                    state.preferenceType !== StaffPreferenceMode.PREFERRED;

                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => {
                        if (
                          state.preferenceType ===
                            StaffPreferenceMode.PREFERRED &&
                          !preferredAvailable
                        ) {
                          setPendingSlot(slot);
                          return;
                        }
                        confirmSlot(slot, false);
                      }}
                      className={`group relative p-4 rounded-xl transition-all flex flex-col items-center gap-1 border-2 ${
                        isSelected
                          ? "bg-primary border-slate-900 dark:border-white shadow-lg"
                          : "bg-white dark:bg-slate-800/50 border-transparent ring-1 ring-slate-200 dark:ring-primary/10 hover:border-primary"
                      }`}
                    >
                      <span
                        className={`text-lg font-bold tracking-tight ${isSelected ? "text-slate-900" : ""}`}
                      >
                        {formatSlotTime(slot.startsAt)}
                      </span>
                      {state.preferenceType ===
                        StaffPreferenceMode.PREFERRED && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                            preferredAvailable
                              ? isSelected
                                ? "bg-slate-900/10 text-slate-900"
                                : "bg-primary/10 text-emerald-600 dark:text-primary"
                              : isSelected
                                ? "bg-slate-900/10 text-slate-900"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                          }`}
                        >
                          {preferredAvailable
                            ? "Tercih edilen personel uygun"
                            : "Diğer personel"}
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-slate-900 dark:bg-primary rounded-full flex items-center justify-center text-white dark:text-slate-900">
                          <span className="material-icons text-[16px]">
                            check
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-background-dark border-t border-slate-200 dark:border-primary/10 p-4 z-30 shadow-[0_-10px_25px_rgba(0,0,0,0.05)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="hidden sm:block">
            {selectedStartsAt && (
              <>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider leading-none mb-1">
                  Seçilen Saat
                </p>
                <p className="text-lg font-bold">
                  {formatSlotDateTime(selectedStartsAt)}
                </p>
              </>
            )}
          </div>
          <button
            className="w-full sm:w-auto px-12 py-4 bg-primary text-slate-900 font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedStartsAt}
            onClick={() => router.push("/book/details")}
            type="button"
          >
            Randevuyu Onayla
          </button>
        </div>
      </div>

      {/* Modal Overlay */}
      {pendingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/20">
            <div className="p-6">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-icons text-primary text-4xl">
                  event_busy
                </span>
              </div>
              <h3 className="text-xl font-bold text-center mb-2">
                Personel Değişikliği
              </h3>
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                Bu saatte tercih ettiğiniz personel dolu. <br />
                <strong>Diğer bir personelle</strong> devam etmek ister misiniz?
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-2">
              <button
                className="w-full py-3.5 bg-primary text-slate-900 font-bold rounded-xl hover:brightness-105 transition-all"
                onClick={() => {
                  confirmSlot(pendingSlot, true);
                  setPendingSlot(null);
                }}
                type="button"
              >
                Evet, Devam Et
              </button>
              <button
                className="w-full py-3.5 bg-transparent text-slate-600 dark:text-slate-400 font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                onClick={() => setPendingSlot(null)}
                type="button"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
