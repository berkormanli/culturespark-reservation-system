"use client";

import { useParams, useRouter } from "next/navigation";
import { useBookingFlow } from "../../../../lib/booking-flow";
import { formatSlotDateTime } from "../../../../lib/booking-utils";

export default function ConfirmationPage() {
  const params = useParams<{ reference: string }>();
  const router = useRouter();
  const { state, actions } = useBookingFlow();

  const reference = params.reference;
  const appointment =
    state.confirmedAppointment && state.confirmedAppointment.id === reference
      ? state.confirmedAppointment
      : null;

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-4">
      {/* Main Container */}
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-xl rounded-xl overflow-hidden border border-primary/10 relative">
        {/* Header / Success Icon */}
        <div className="pt-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-4">
            <span className="material-icons text-primary text-5xl">
              check_circle
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-800 dark:text-white px-6">
            Harika! Randevun Onaylandı
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 px-6">
            İşlemin başarıyla tamamlandı. Randevu bilgilerini aşağıda
            bulabilirsin.
          </p>
        </div>

        {/* Reference Code Section */}
        <div className="px-6 py-4 bg-primary/5 border-y border-primary/10 flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-1">
            RANDEVU NUMARASI
          </span>
          <div className="text-2xl font-mono font-bold text-zinc-800 dark:text-white tracking-wider">
            #{reference}
          </div>
        </div>

        {/* Appointment Details */}
        <div className="p-6 space-y-6">
          {appointment ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-zinc-500">
                    storefront
                  </span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Şube
                  </p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {state.branchName ?? "Şube Bilgisi Yok"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-zinc-500">
                    calendar_today
                  </span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Tarih ve Saat
                  </p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {formatSlotDateTime(appointment.startsAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-zinc-500">person</span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Personel
                  </p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {appointment.assignedStaff.name}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-zinc-500">
                    content_cut
                  </span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Hizmetler
                  </p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {state.selectedServices.map((s) => s.name).join(", ")}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-500 italic">
              Randevu özeti sayfa yenilendiği için gösterilemiyor, ancak
              numaranız geçerlidir.
            </p>
          )}

          {/* Map Placeholder */}
          <div className="rounded-xl overflow-hidden h-32 relative border border-zinc-200 dark:border-zinc-800 bg-zinc-100 flex items-center justify-center">
            <span className="material-icons text-zinc-300 text-5xl">map</span>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-primary p-2 rounded-full shadow-lg">
                <span className="material-icons text-white">location_on</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-6 pt-0 space-y-3">
          <button
            onClick={() => {
              actions.resetBooking();
              router.push("/");
            }}
            className="w-full bg-primary hover:brightness-95 text-zinc-900 font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/20"
            type="button"
          >
            Ana Sayfaya Dön
          </button>
          <button
            onClick={() => {
              actions.resetBooking();
              router.push("/");
            }}
            className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold py-4 rounded-xl transition-all"
            type="button"
          >
            Yeni Randevu Oluştur
          </button>
        </div>

        {/* Help Link */}
        <div className="pb-8 text-center px-6">
          <p className="text-xs text-zinc-400">
            Yardım almak için şube ile iletişime geçebilirsiniz.
          </p>
        </div>
      </div>

      {/* Background Decoration Elements */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="fixed -bottom-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
    </div>
  );
}
