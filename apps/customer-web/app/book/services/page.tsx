"use client";

import type { PublicService } from "@culturespark/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { publicApiClient } from "../../../lib/api";
import { useBookingFlow } from "../../../lib/booking-flow";
import {
  getFriendlyErrorMessage,
  getTodayInIstanbul,
} from "../../../lib/booking-utils";

export default function ServiceSelectPage() {
  const router = useRouter();
  const { state, actions } = useBookingFlow();
  const [services, setServices] = useState<PublicService[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(state.serviceIds);
  const [date, setDate] = useState(state.date ?? getTodayInIstanbul());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!state.branchId) {
      router.replace("/");
    }
  }, [router, state.branchId]);

  useEffect(() => {
    if (!state.branchId) {
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);
    publicApiClient
      .getPublicBranchServices({
        branchId: state.branchId,
        date,
        size: 50,
        signal: controller.signal,
      })
      .then((response) => {
        setServices(response.items);
        setSelectedIds((existing) =>
          existing.filter((serviceId) =>
            response.items.some(
              (service) => service.id === serviceId && service.isBookable,
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
  }, [date, state.branchId]);

  const selectedServiceModels = useMemo(
    () =>
      services
        .filter((service) => selectedIds.includes(service.id))
        .map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
        })),
    [selectedIds, services],
  );

  const filteredServices = useMemo(() => {
    if (!searchTerm) return services;
    return services.filter((s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [services, searchTerm]);

  const totalDuration = useMemo(() => {
    return selectedServiceModels.reduce(
      (acc, s) => acc + s.durationMinutes + s.bufferMinutes,
      0,
    );
  }, [selectedServiceModels]);

  if (!state.branchId) {
    return null;
  }

  return (
    <div className="min-h-screen flex justify-center bg-background-light dark:bg-background-dark">
      <div className="w-full max-w-[480px] h-screen sm:h-[850px] bg-white dark:bg-zinc-900 shadow-2xl relative flex flex-col overflow-hidden sm:my-4 sm:rounded-xl border border-primary/10">
        {/* Header */}
        <header className="pt-6 px-6 pb-4 bg-white dark:bg-zinc-900 sticky top-0 z-20">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.push("/")}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-zinc-800 dark:text-zinc-100 hover:bg-primary/20 transition-colors"
              type="button"
            >
              <span className="material-icons">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
              Hizmet Seçimi
            </h1>
            <div className="w-10" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="service-date"
                className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
              >
                Tarih:
              </label>
              <input
                id="service-date"
                onChange={(event) => {
                  const nextDate = event.currentTarget.value;
                  setDate(nextDate);
                  actions.setDate(nextDate);
                }}
                type="date"
                value={date}
                className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs py-1 px-2 focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="relative group">
              <span className="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                className="w-full pl-12 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white transition-all"
                placeholder="Hizmet ara..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Service List */}
        <div className="flex-1 overflow-y-auto px-6 pb-32 custom-scrollbar">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg my-4 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Hizmetler yükleniyor...
            </div>
          ) : (
            <div className="mt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-4">
                Hizmetler
              </h2>
              <div className="space-y-3">
                {filteredServices.map((service) => {
                  const disabled = !service.isBookable;
                  const isSelected = selectedIds.includes(service.id);

                  return (
                    <label
                      key={service.id}
                      className={`block relative group cursor-pointer ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <input
                        checked={isSelected}
                        className="hidden peer"
                        disabled={disabled}
                        onChange={(event) => {
                          const { checked } = event.currentTarget;
                          setSelectedIds((existing) => {
                            if (checked) return [...existing, service.id];
                            return existing.filter((id) => id !== service.id);
                          });
                        }}
                        type="checkbox"
                      />
                      <div
                        className={`p-4 border-2 rounded-xl transition-all ${
                          isSelected
                            ? "bg-primary/5 border-primary"
                            : "bg-zinc-50 dark:bg-zinc-800 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                        } ${disabled ? "bg-zinc-100 dark:bg-zinc-800/50 border-dashed border-zinc-200" : ""}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3
                              className={`font-bold ${isSelected ? "text-zinc-900 dark:text-white" : "text-zinc-800 dark:text-zinc-100"}`}
                            >
                              {service.name}
                            </h3>
                            <div className="flex items-center mt-1 text-zinc-500 dark:text-zinc-400 text-sm">
                              <span className="material-icons text-sm mr-1">
                                schedule
                              </span>
                              <span>
                                {service.durationMinutes +
                                  service.bufferMinutes}{" "}
                                dk
                              </span>
                            </div>
                            {disabled && (
                              <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 uppercase">
                                {!service.isActiveGlobally
                                  ? "Devre Dışı"
                                  : "Müsait Değil"}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className="font-bold text-zinc-900 dark:text-white block">
                              Seç
                            </span>
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center mt-1 transition-colors ${
                                isSelected
                                  ? "bg-primary text-white"
                                  : "border-2 border-zinc-300 dark:border-zinc-600 text-transparent"
                              }`}
                            >
                              <span className="material-icons text-sm">
                                done
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Summary Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
                {selectedIds.length} Hizmet Seçildi
              </p>
              <div className="flex items-center mt-1">
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  Toplam: {totalDuration} dk
                </span>
              </div>
            </div>
            <button
              className="bg-primary hover:bg-primary/90 text-zinc-900 font-bold px-8 py-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={selectedServiceModels.length === 0}
              onClick={() => {
                actions.setDate(date);
                actions.setServices({
                  serviceIds: selectedServiceModels.map(
                    (service) => service.id,
                  ),
                  selectedServices: selectedServiceModels,
                });
                router.push("/book/staff");
              }}
              type="button"
            >
              Devam Et
              <span className="material-icons">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
