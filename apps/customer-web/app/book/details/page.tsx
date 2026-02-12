"use client";

import { ApiClientError, createIdempotencyKey } from "@culturespark/api-client";
import { StaffPreferenceMode } from "@culturespark/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { publicApiClient } from "../../../lib/api";
import { useBookingFlow } from "../../../lib/booking-flow";
import {
  buildSelectionSignature,
  formatSlotDateTime,
  getFriendlyErrorMessage,
  isSlotAlignedToInterval,
  normalizePhone,
} from "../../../lib/booking-utils";

export default function CustomerDetailsPage() {
  const router = useRouter();
  const { state, actions } = useBookingFlow();
  const [customerName, setCustomerName] = useState(state.customerName);
  const [customerPhone, setCustomerPhone] = useState(state.customerPhone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreferredUnavailableModal, setShowPreferredUnavailableModal] =
    useState(false);

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
      return;
    }
    if (!state.date || !state.selectedStartsAt) {
      router.replace("/book/time");
    }
  }, [
    requiresStaff,
    router,
    state.branchId,
    state.date,
    state.preferenceType,
    state.requestedStaffId,
    state.selectedStartsAt,
    state.serviceIds.length,
  ]);

  const selectionSignature = useMemo(() => {
    if (
      !state.branchId ||
      !state.preferenceType ||
      !state.date ||
      !state.selectedStartsAt
    ) {
      return null;
    }

    return buildSelectionSignature({
      branchId: state.branchId,
      serviceIds: state.serviceIds,
      preferenceType: state.preferenceType,
      requestedStaffId: state.requestedStaffId,
      date: state.date,
      selectedStartsAt: state.selectedStartsAt,
      allowAlternateStaff: state.allowAlternateStaff,
    });
  }, [
    state.allowAlternateStaff,
    state.branchId,
    state.date,
    state.preferenceType,
    state.requestedStaffId,
    state.selectedStartsAt,
    state.serviceIds,
  ]);

  useEffect(() => {
    if (!selectionSignature) {
      return;
    }

    if (
      state.idempotencySelectionSignature === selectionSignature &&
      state.idempotencyKey
    ) {
      return;
    }

    actions.setIdempotency({
      key: createIdempotencyKey(),
      selectionSignature,
    });
  }, [
    actions,
    selectionSignature,
    state.idempotencyKey,
    state.idempotencySelectionSignature,
  ]);

  if (
    !state.branchId ||
    !state.preferenceType ||
    !state.date ||
    !state.selectedStartsAt ||
    (requiresStaff && !state.requestedStaffId)
  ) {
    return null;
  }

  const branchId = state.branchId;
  const preferenceType = state.preferenceType;
  const startsAt = state.selectedStartsAt;
  const normalizedPhone = normalizePhone(customerPhone);
  const slotIsAligned =
    state.slotIntervalMinutes !== null &&
    isSlotAlignedToInterval(state.selectedStartsAt, state.slotIntervalMinutes);
  const idempotencyKey = state.idempotencyKey;

  const handleConfirm = async () => {
    setError(null);
    actions.setCustomerDetails({
      customerName,
      customerPhone,
    });

    if (customerName.trim().length === 0) {
      setError("Ad soyad girmelisiniz.");
      return;
    }
    if (normalizedPhone.length < 8) {
      setError("Geçerli bir telefon numarası girmelisiniz.");
      return;
    }
    if (!slotIsAligned || state.slotIntervalMinutes === null) {
      setError("Seçilen saat geçersiz. Lütfen yeni bir saat seçin.");
      return;
    }
    if (requiresStaff && !state.requestedStaffId) {
      setError("Lütfen bir personel seçin.");
      return;
    }

    setSubmitting(true);
    try {
      let requestIdempotencyKey = idempotencyKey;
      if (!requestIdempotencyKey) {
        requestIdempotencyKey = createIdempotencyKey();
        if (selectionSignature) {
          actions.setIdempotency({
            key: requestIdempotencyKey,
            selectionSignature,
          });
        }
      }

      const response = await publicApiClient.createPublicAppointment({
        idempotencyKey: requestIdempotencyKey,
        body: {
          branchId,
          serviceIds: state.serviceIds,
          startsAt,
          preferenceType,
          ...(state.requestedStaffId
            ? { requestedStaffId: state.requestedStaffId }
            : {}),
          allowAlternateStaff: state.allowAlternateStaff,
          customer: {
            name: customerName.trim(),
            phone: normalizedPhone,
          },
        },
      });

      actions.setConfirmedAppointment(response.appointment);
      router.push(`/book/confirmed/${response.appointment.id}`);
    } catch (requestError: unknown) {
      if (
        requestError instanceof ApiClientError &&
        requestError.code === "PREFERRED_STAFF_UNAVAILABLE"
      ) {
        setShowPreferredUnavailableModal(true);
        return;
      }

      if (
        requestError instanceof ApiClientError &&
        requestError.code === "SLOT_CONFLICT"
      ) {
        setError("Bu saat az önce doldu. Lütfen başka saat seçin.");
        return;
      }

      setError(getFriendlyErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 rounded-xl shadow-lg flex items-center gap-3">
            <span className="material-icons text-red-500">error_outline</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Hata
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
              type="button"
            >
              <span className="material-icons text-sm">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 pt-12 pb-12">
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <button
              className="cursor-pointer hover:text-primary bg-transparent border-none p-0 font-inherit"
              onClick={() => router.push("/book/services")}
              type="button"
            >
              Hizmet Seçimi
            </button>
            <span className="material-icons text-xs">chevron_right</span>
            <button
              className="cursor-pointer hover:text-primary bg-transparent border-none p-0 font-inherit"
              onClick={() => router.push("/book/time")}
              type="button"
            >
              Tarih & Saat
            </button>
            <span className="material-icons text-xs text-primary">
              chevron_right
            </span>
            <span className="text-primary font-medium">Onay</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight">
            Müşteri Bilgileri ve Onay
          </h1>
          <p className="text-slate-500 mt-2">
            Randevunuzu tamamlamak için lütfen bilgilerinizi kontrol edin.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Section */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm">
                  1
                </span>
                İletişim Bilgileri
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    htmlFor="full_name"
                  >
                    Ad Soyad
                  </label>
                  <input
                    className="w-full rounded-lg border-slate-300 dark:border-slate-700 dark:bg-slate-800 focus:ring-primary focus:border-primary transition-all"
                    id="full_name"
                    name="full_name"
                    placeholder="Adınız ve Soyadınız"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    htmlFor="phone"
                  >
                    Telefon Numarası
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                      +
                    </span>
                    <input
                      className="w-full pl-12 rounded-lg border-slate-300 dark:border-slate-700 dark:bg-slate-800 focus:ring-primary focus:border-primary transition-all"
                      id="phone"
                      name="phone"
                      placeholder="90 5xx xxx xx xx"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm">
                  2
                </span>
                Yasal Bilgilendirme
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                  <input
                    className="mt-1 rounded border-slate-300 text-primary focus:ring-primary"
                    id="privacy"
                    type="checkbox"
                    defaultChecked
                  />
                  <label
                    className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed"
                    htmlFor="privacy"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      KVKK Metni ve Gizlilik Politikası:
                    </span>{" "}
                    Kişisel verilerimin işlenmesini ve randevu takibi amacıyla
                    benimle iletişime geçilmesini kabul ediyorum.
                  </label>
                </div>
              </div>
            </section>
          </div>

          {/* Summary Card Section */}
          <div className="lg:col-span-5 sticky top-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border-t-4 border-t-primary border-x border-b border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xl font-bold">Randevu Özeti</h3>
              </div>
              <div className="p-6 space-y-6">
                {/* Branch */}
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <span className="material-icons text-slate-500">store</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      ŞUBE
                    </p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {state.branchName}
                    </p>
                  </div>
                </div>
                {/* Services */}
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <span className="material-icons text-slate-500">
                      content_cut
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      HİZMETLER
                    </p>
                    <ul className="space-y-1 mt-1">
                      {state.selectedServices.map((service) => (
                        <li
                          key={service.id}
                          className="flex justify-between items-center text-sm"
                        >
                          <span>{service.name}</span>
                          <span className="font-medium">
                            {service.durationMinutes + service.bufferMinutes} dk
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {/* Staff */}
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <span className="material-icons text-slate-500">
                      person
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      UZMAN
                    </p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {state.requestedStaffName ?? "Farketmez"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {state.preferenceType}
                    </p>
                  </div>
                </div>
                {/* Date/Time */}
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons text-primary">
                      calendar_today
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      TARİH & SAAT
                    </p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                      {formatSlotDateTime(startsAt)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="w-full bg-primary hover:bg-primary/90 text-slate-900 font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  {submitting ? "İşleniyor..." : "Randevuyu Onayla"}
                  <span className="material-icons group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </button>
                <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest">
                  İşlem sonunda onay kodu verilecektir
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Preferred Unavailable Modal */}
      {showPreferredUnavailableModal && (
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
                Tercih ettiğiniz personel artık müsait değil. Başka bir
                personelle devam etmek ister misiniz?
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-2">
              <button
                className="w-full py-3.5 bg-primary text-slate-900 font-bold rounded-xl hover:brightness-105 transition-all"
                onClick={() => {
                  actions.setAllowAlternateStaff(true);
                  setShowPreferredUnavailableModal(false);
                  handleConfirm();
                }}
                type="button"
              >
                Evet, Devam Et
              </button>
              <button
                className="w-full py-3.5 bg-transparent text-slate-600 dark:text-slate-400 font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                onClick={() => {
                  setShowPreferredUnavailableModal(false);
                  router.push("/book/time");
                }}
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
