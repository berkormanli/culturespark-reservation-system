"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../components/auth-context";
import { useBranchScope } from "../../../../components/branch-scope-context";
import { ApiClientError } from "../../../../lib/api";
import {
  type ServiceSuspensionPreview,
  listServicesByBranchAndDate,
  previewServiceSuspension,
} from "../../../../lib/staff-api";
import {
  fromDateTimeInputToIso,
  toDateInputValue,
  toIstanbulDateTimeLabel,
} from "../../../../lib/time";
import type { ServiceSummary } from "../../../../lib/types";

type WizardStep = "A" | "B" | "C";

type WizardState = {
  serviceId: string;
  startsAtInput: string;
  endsAtInput: string;
};

const buildDefaultWizardState = (): WizardState => {
  const today = toDateInputValue(new Date());
  return {
    serviceId: "",
    startsAtInput: `${today}T09:00`,
    endsAtInput: `${today}T18:00`,
  };
};

const isPreviewInputValid = (state: WizardState): boolean =>
  Boolean(
    state.serviceId &&
      state.startsAtInput &&
      state.endsAtInput &&
      state.endsAtInput > state.startsAtInput,
  );

export default function DisableServicePage() {
  const router = useRouter();
  const { authorizedRequest } = useAuth();
  const { selectedBranchId, canSwitchBranch } = useBranchScope();

  const [wizardState, setWizardState] = useState<WizardState>(() =>
    buildDefaultWizardState(),
  );
  const [currentStep, setCurrentStep] = useState<WizardStep>("A");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [preview, setPreview] = useState<ServiceSuspensionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<
    string[]
  >([]);
  const [bulkCancelLoading, setBulkCancelLoading] = useState(false);
  const [bulkCancelMessage, setBulkCancelMessage] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");

  const branchId = selectedBranchId;
  const disableBranchScopedUi = canSwitchBranch && !branchId;
  const selectedDate = wizardState.startsAtInput.slice(0, 10);

  useEffect(() => {
    const loadServices = async () => {
      if (!branchId) {
        setServices([]);
        return;
      }

      const items = await listServicesByBranchAndDate(branchId, selectedDate);
      setServices(items);
      if (!items.some((service) => service.id === wizardState.serviceId)) {
        setWizardState((previous) => ({
          ...previous,
          serviceId: items[0]?.id ?? "",
        }));
      }
    };

    void loadServices().catch(() => {
      setServices([]);
      setPreviewError("Hizmetler yüklenemedi.");
    });
  }, [branchId, selectedDate, wizardState.serviceId]);

  const refreshPreview = useCallback(async () => {
    if (!branchId || !isPreviewInputValid(wizardState)) {
      setPreview(null);
      setSelectedAppointmentIds([]);
      setCurrentStep("A");
      return;
    }

    setPreviewLoading(true);
    setPreviewError("");
    setBulkCancelMessage("");
    setApplyMessage("");

    try {
      const nextPreview = await previewServiceSuspension(
        authorizedRequest,
        branchId,
        {
          serviceId: wizardState.serviceId,
          startsAt: fromDateTimeInputToIso(wizardState.startsAtInput),
          endsAt: fromDateTimeInputToIso(wizardState.endsAtInput),
        },
      );

      setPreview(nextPreview);
      setSelectedAppointmentIds((previous) =>
        previous.filter((id) =>
          nextPreview.impactedAppointments.some(
            (item) => item.appointmentId === id,
          ),
        ),
      );
      setCurrentStep(nextPreview.impactedCount > 0 ? "B" : "C");
    } catch {
      setPreview(null);
      setSelectedAppointmentIds([]);
      setPreviewError("Etki analizi yapılamadı.");
      setCurrentStep("A");
    } finally {
      setPreviewLoading(false);
    }
  }, [authorizedRequest, branchId, wizardState]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const toggleAppointmentSelection = (appointmentId: string) => {
    setSelectedAppointmentIds((previous) =>
      previous.includes(appointmentId)
        ? previous.filter((id) => id !== appointmentId)
        : [...previous, appointmentId],
    );
  };

  const selectAllImpacted = () => {
    setSelectedAppointmentIds(
      preview?.impactedAppointments.map((item) => item.appointmentId) ?? [],
    );
  };

  const clearSelectedImpacted = () => {
    setSelectedAppointmentIds([]);
  };

  const bulkCancelSelected = async () => {
    if (!preview || selectedAppointmentIds.length === 0) {
      return;
    }

    setBulkCancelLoading(true);
    setBulkCancelMessage("");

    let successCount = 0;
    for (const appointmentId of selectedAppointmentIds) {
      try {
        await authorizedRequest(`/admin/appointments/${appointmentId}/cancel`, {
          method: "POST",
          body: {
            reason: "SERVICE_DISABLED",
            customerContacted: true,
            override: false,
            note: "Hizmet Kısıtlama Sihirbazı tarafından iptal edildi.",
          },
        });
        successCount += 1;
      } catch {
        // Continue processing others
      }
    }

    setBulkCancelMessage(
      successCount === selectedAppointmentIds.length
        ? `${successCount} randevu iptal edildi.`
        : `${selectedAppointmentIds.length} randevudan ${successCount} tanesi iptal edilebildi.`,
    );
    setBulkCancelLoading(false);
    await refreshPreview();
  };

  const applySuspension = async () => {
    if (!branchId || !isPreviewInputValid(wizardState)) {
      return;
    }

    setApplyLoading(true);
    setApplyMessage("");

    try {
      await authorizedRequest(
        `/admin/branches/${branchId}/service-suspensions`,
        {
          method: "POST",
          body: {
            serviceId: wizardState.serviceId,
            startsAt: fromDateTimeInputToIso(wizardState.startsAtInput),
            endsAt: fromDateTimeInputToIso(wizardState.endsAtInput),
          },
        },
      );
      setApplyMessage("Hizmet kısıtlaması başarıyla uygulandı.");
      setCurrentStep("C");
      await refreshPreview();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "IMPACTED_APPOINTMENTS_EXIST"
      ) {
        setApplyMessage(
          "Hala çakışan randevular mevcut. Lütfen Step B'deki randevuları yönetin.",
        );
        setCurrentStep("B");
        await refreshPreview();
      } else {
        setApplyMessage("Kısıtlama uygulanamadı.");
      }
    } finally {
      setApplyLoading(false);
    }
  };

  const impactedCount = preview?.impactedCount ?? 0;
  const canApplySuspension =
    impactedCount === 0 && isPreviewInputValid(wizardState);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900 border border-primary/10 rounded-2xl p-8 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Hizmeti Devre Dışı Bırak</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Hizmet kısıtlama sihirbazı ile randevuları yönetin.</p>
        </div>
        <Link href="/calendar" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <span className="material-icons">close</span>
        </Link>
      </div>

      {/* Stepper Component */}
      <div className="px-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all ${currentStep !== "A" ? "bg-primary" : "bg-primary ring-4 ring-primary/20"}`}>
              {currentStep !== "A" ? <span className="material-icons text-sm">check</span> : <span className="text-sm font-bold">1</span>}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${currentStep === "A" ? "text-primary" : "text-slate-400"}`}>SEÇİM</span>
          </div>
          <div className={`step-connector ${currentStep !== "A" ? "active" : ""}`} />
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all ${currentStep === "B" ? "bg-primary ring-4 ring-primary/20" : currentStep === "C" ? "bg-primary" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}>
              {currentStep === "C" ? <span className="material-icons text-sm">check</span> : <span className="text-sm font-bold">2</span>}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${currentStep === "B" ? "text-primary" : "text-slate-400"}`}>ETKİ ANALİZİ</span>
          </div>
          <div className={`step-connector ${currentStep === "C" ? "active" : ""}`} />
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep === "C" ? "bg-primary text-white ring-4 ring-primary/20" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}>
              <span className="text-sm font-bold">3</span>
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${currentStep === "C" ? "text-primary" : "text-slate-400"}`}>ONAY</span>
          </div>
        </div>
      </div>

      {/* Step A: Selection */}
      <section className="bg-white dark:bg-slate-900 border border-primary/10 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-6 h-6 bg-primary/20 text-primary text-xs rounded-lg flex items-center justify-center">1</span>
            Hizmet ve Tarih Aralığı Seçimi
          </h2>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <label htmlFor="wizard-service" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">HİZMET</label>
            <select
              id="wizard-service"
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-900 dark:text-white"
              value={wizardState.serviceId}
              onChange={(e) => setWizardState(p => ({ ...p, serviceId: e.target.value }))}
              disabled={disableBranchScopedUi || previewLoading}
            >
              <option value="">Hizmet seçiniz...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="wizard-startsAt" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">BAŞLANGIÇ (İSTANBUL)</label>
            <input
              id="wizard-startsAt"
              type="datetime-local"
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-900 dark:text-white"
              value={wizardState.startsAtInput}
              onChange={(e) => setWizardState(p => ({ ...p, startsAtInput: e.target.value }))}
              disabled={disableBranchScopedUi || previewLoading}
            />
          </div>
          <div>
            <label htmlFor="wizard-endsAt" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">BİTİŞ (İSTANBUL)</label>
            <input
              id="wizard-endsAt"
              type="datetime-local"
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-900 dark:text-white"
              value={wizardState.endsAtInput}
              onChange={(e) => setWizardState(p => ({ ...p, endsAtInput: e.target.value }))}
              disabled={disableBranchScopedUi || previewLoading}
            />
          </div>
        </div>
        {previewError && <div className="mx-8 mb-8 p-4 bg-red-50 dark:bg-red-950/20 text-red-600 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/30">{previewError}</div>}
      </section>

      {/* Step B: Impact Analysis */}
      {(currentStep === "B" || impactedCount > 0) && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-6 flex items-start gap-4">
            <div className="bg-amber-100 dark:bg-amber-800/40 p-2 rounded-xl text-amber-600 dark:text-amber-400">
              <span className="material-icons">warning</span>
            </div>
            <div>
              <h3 className="text-amber-800 dark:text-amber-300 font-bold mb-1">Çakışan Randevular Tespit Edildi</h3>
              <p className="text-amber-700 dark:text-amber-400/80 text-sm leading-relaxed">
                Seçilen aralıkta bu hizmet için toplam <span className="font-black">{impactedCount} adet aktif randevu</span> bulunmaktadır. Devam etmek için bu randevuları iptal etmelisiniz.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-primary/10 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
                Seçilen: {selectedAppointmentIds.length} randevu
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-white dark:hover:bg-slate-800 transition-all"
                  onClick={selectedAppointmentIds.length === impactedCount ? clearSelectedImpacted : selectAllImpacted}
                >
                  {selectedAppointmentIds.length === impactedCount ? "Seçimi Kaldır" : "Tümünü Seç"}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:grayscale"
                  onClick={() => void bulkCancelSelected()}
                  disabled={bulkCancelLoading || selectedAppointmentIds.length === 0}
                >
                  <span className="material-icons text-sm">cancel</span>
                  {bulkCancelLoading ? "İşleniyor..." : "Seçilenleri İptal Et"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-4 w-12 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-900"
                        checked={impactedCount > 0 && selectedAppointmentIds.length === impactedCount}
                        onChange={selectedAppointmentIds.length === impactedCount ? clearSelectedImpacted : selectAllImpacted}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Randevu Bilgisi</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Müşteri</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Personel</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview?.impactedAppointments.map((item) => (
                    <tr key={item.appointmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-900"
                          checked={selectedAppointmentIds.includes(item.appointmentId)}
                          onChange={() => toggleAppointmentSelection(item.appointmentId)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {toIstanbulDateTimeLabel(item.startsAt).split(" ")[0]}
                          </span>
                          <span className="text-xs text-slate-500">
                            {toIstanbulDateTimeLabel(item.startsAt).split(" ")[1]}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{item.customer.name}</span>
                          <span className="text-xs text-slate-500">{item.customer.phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.assignedStaff.name}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/calendar?date=${item.startsAt.slice(0, 10)}&focusAppointmentId=${item.appointmentId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline font-bold text-xs"
                        >
                          <span className="material-icons text-sm">calendar_today</span>
                          Takvimde Aç
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {bulkCancelMessage && <p className="text-sm font-bold text-primary text-center">{bulkCancelMessage}</p>}
        </section>
      )}

      {/* Step C: Application */}
      {currentStep === "C" && (
        <section className="bg-white dark:bg-slate-900 border border-primary/10 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 bg-primary/20 text-primary text-xs rounded-lg flex items-center justify-center">3</span>
              Kısıtlamayı Onayla
            </h2>
          </div>
          <div className="p-8 space-y-6 text-center">
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons text-4xl">check_circle</span>
            </div>
            <div className="max-w-md mx-auto">
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                Seçtiğiniz zaman aralığı için herhangi bir randevu çakışması bulunmamaktadır.
                Kısıtlamayı şimdi uygulayabilirsiniz.
              </p>
            </div>
            <button
              type="button"
              className="px-12 py-4 bg-primary text-zinc-900 rounded-2xl text-sm font-black hover:opacity-90 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
              onClick={() => void applySuspension()}
              disabled={!canApplySuspension || applyLoading}
            >
              {applyLoading ? "İşlem Yapılıyor..." : "Kısıtlamayı Uygula"}
            </button>
            {applyMessage && <p className="text-sm font-bold text-primary">{applyMessage}</p>}
          </div>
        </section>
      )}

      {/* Footer Navigation */}
      <div className="pt-8 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={() => currentStep === "B" ? setCurrentStep("A") : currentStep === "C" ? setCurrentStep("B") : router.push("/calendar")}
          className="flex items-center gap-2 px-6 py-3 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-white dark:hover:bg-slate-800 transition-all"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Geri Dön
        </button>
        
        {currentStep === "A" && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sonraki Adım</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">Etki Analizi</span>
            </div>
            <button
              onClick={() => void refreshPreview()}
              disabled={!isPreviewInputValid(wizardState) || previewLoading}
              className="px-8 py-3 bg-primary text-zinc-900 rounded-xl font-black hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:grayscale"
            >
              Devam Et
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
