"use client";

import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import { useAuth } from "../../../components/auth-context";
import { useBranchScope } from "../../../components/branch-scope-context";
import { ApiClientError } from "../../../lib/api";
import {
  listAppointmentsByRange,
  listServicesByBranchAndDate,
  listStaffByBranch,
} from "../../../lib/staff-api";
import {
  addDays,
  fromDateTimeInputToIso,
  getStartOfDayIso,
  toDateInputValue,
  toDateTimeInputValue,
  toIstanbulDateTimeLabel,
  toIstanbulTimeLabel,
} from "../../../lib/time";
import type {
  Appointment,
  CancellationReason,
  ServiceSummary,
  StaffSummary,
} from "../../../lib/types";

type ViewMode = "day" | "week";
type EditorMode = "create" | "edit" | null;

type AppointmentEditorState = {
  startsAtInput: string;
  assignedStaffId: string;
  customerName: string;
  customerPhone: string;
  serviceIds: string[];
};

type CancellationFormState = {
  reason: CancellationReason;
  customerContacted: boolean;
  override: boolean;
  note: string;
};

const initialCancellationForm: CancellationFormState = {
  reason: "CUSTOMER_REQUEST",
  customerContacted: false,
  override: false,
  note: "",
};

const toRange = (dateValue: string, viewMode: ViewMode) => ({
  from: getStartOfDayIso(dateValue),
  to: getStartOfDayIso(addDays(dateValue, viewMode === "day" ? 1 : 7)),
});

const getDayKey = (isoString: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));

const getDayLabel = (dateString: string): string =>
  new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
  }).format(new Date(dateString));

const getDayNumber = (dateString: string): string =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
  }).format(new Date(dateString));

const sortByName = <T extends { name: string }>(items: T[]): T[] =>
  [...items].sort((first, second) => first.name.localeCompare(second.name));

function CalendarContent() {
  const searchParams = useSearchParams();
  const { authorizedRequest } = useAuth();
  const { selectedBranchId, canSwitchBranch } = useBranchScope();

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(() => {
    const dateFromQuery = searchParams.get("date");
    if (dateFromQuery && /^\d{4}-\d{2}-\d{2}$/.test(dateFromQuery)) {
      return dateFromQuery;
    }
    return toDateInputValue(new Date());
  });
  const [staffFilter, setStaffFilter] = useState("");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorAppointment, setEditorAppointment] =
    useState<Appointment | null>(null);
  const [editorState, setEditorState] = useState<AppointmentEditorState>({
    startsAtInput: `${toDateInputValue(new Date())}T10:00`,
    assignedStaffId: "",
    customerName: "",
    customerPhone: "",
    serviceIds: [],
  });
  const [editorError, setEditorError] = useState("");
  const [isSubmittingEditor, setIsSubmittingEditor] = useState(false);

  const [cancelAppointment, setCancelAppointment] =
    useState<Appointment | null>(null);
  const [cancelForm, setCancelForm] = useState<CancellationFormState>(
    initialCancellationForm,
  );
  const [cancelError, setCancelError] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [overrideDisabledByBranch, setOverrideDisabledByBranch] = useState<
    Record<string, boolean>
  >({});

  const branchId = selectedBranchId;
  const focusAppointmentId = searchParams.get("focusAppointmentId") ?? "";
  const overrideDisabled = branchId
    ? overrideDisabledByBranch[branchId] === true
    : false;

  const loadData = useCallback(async () => {
    if (!branchId) {
      setAppointments([]);
      setStaff([]);
      setServices([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const range = toRange(selectedDate, viewMode);
    try {
      const [appointmentItems, branchServices, branchStaff] = await Promise.all(
        [
          listAppointmentsByRange(authorizedRequest, {
            branchId,
            from: range.from,
            to: range.to,
            ...(staffFilter ? { staffId: staffFilter } : {}),
          }),
          listServicesByBranchAndDate(branchId, selectedDate),
          listStaffByBranch(authorizedRequest, branchId),
        ],
      );

      const fallbackStaff = sortByName(
        Array.from(
          new Map(
            appointmentItems.map((item) => [
              item.assignedStaff.id,
              item.assignedStaff.name,
            ]),
          ).entries(),
        ).map(([id, name]) => ({ id, name })),
      );

      setAppointments(appointmentItems);
      setServices(branchServices);
      setStaff(
        branchStaff.length > 0 ? sortByName(branchStaff) : fallbackStaff,
      );
    } catch {
      setErrorMessage("Takvim verileri yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [authorizedRequest, branchId, selectedDate, staffFilter, viewMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const dateFromQuery = searchParams.get("date");
    if (
      dateFromQuery &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateFromQuery) &&
      dateFromQuery !== selectedDate
    ) {
      setSelectedDate(dateFromQuery);
    }
  }, [searchParams, selectedDate]);

  useEffect(() => {
    if (!staffFilter) {
      return;
    }

    const hasStaff = staff.some((member) => member.id === staffFilter);
    if (!hasStaff) {
      setStaffFilter("");
    }
  }, [staff, staffFilter]);

  const appointmentDayBuckets = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const dayKey = getDayKey(appointment.startsAt);
      const existing = map.get(dayKey);
      if (existing) {
        existing.push(appointment);
      } else {
        map.set(dayKey, [appointment]);
      }
    }

    const days: string[] = [];
    const daysInRange = viewMode === "day" ? 1 : 7;
    for (let index = 0; index < daysInRange; index += 1) {
      days.push(addDays(selectedDate, index));
    }

    return days.map((day) => ({
      day,
      appointments: (map.get(day) ?? []).sort((first, second) =>
        first.startsAt.localeCompare(second.startsAt),
      ),
    }));
  }, [appointments, selectedDate, viewMode]);

  const openCreateEditor = () => {
    setEditorMode("create");
    setEditorAppointment(null);
    setEditorError("");
    setEditorState({
      startsAtInput: `${selectedDate}T10:00`,
      assignedStaffId: staff[0]?.id ?? "",
      customerName: "",
      customerPhone: "",
      serviceIds: [],
    });
  };

  const openEditEditor = (appointment: Appointment) => {
    setEditorMode("edit");
    setEditorAppointment(appointment);
    setEditorError("");
    setEditorState({
      startsAtInput: toDateTimeInputValue(appointment.startsAt),
      assignedStaffId: appointment.assignedStaff.id,
      customerName: appointment.customer.name,
      customerPhone: appointment.customer.phone,
      serviceIds: appointment.services.map((service) => service.id),
    });
  };

  const submitEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!branchId) {
      return;
    }

    if (editorState.serviceIds.length === 0) {
      setEditorError("En az bir hizmet seçiniz.");
      return;
    }

    if (!editorState.assignedStaffId) {
      setEditorError("Personel seçiniz.");
      return;
    }

    setIsSubmittingEditor(true);
    setEditorError("");

    const payload = {
      startsAt: fromDateTimeInputToIso(editorState.startsAtInput),
      assignedStaffId: editorState.assignedStaffId,
      serviceIds: editorState.serviceIds,
    };

    try {
      if (editorMode === "create") {
        await authorizedRequest("/admin/appointments", {
          method: "POST",
          body: {
            ...payload,
            branchId,
            preferenceType: "ANY",
            customer: {
              name: editorState.customerName,
              phone: editorState.customerPhone,
            },
          },
        });
      } else if (editorMode === "edit" && editorAppointment) {
        await authorizedRequest(`/admin/appointments/${editorAppointment.id}`, {
          method: "PATCH",
          body: payload,
        });
      }

      setEditorMode(null);
      setEditorAppointment(null);
      await loadData();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "SLOT_CONFLICT") {
        setEditorError("Bu saat dilimi dolu. Lütfen başka bir saat veya personel seçiniz.");
      } else {
        setEditorError("Randevu kaydedilemedi.");
      }
    } finally {
      setIsSubmittingEditor(false);
    }
  };

  const openCancelDialog = (appointment: Appointment) => {
    setCancelAppointment(appointment);
    setCancelForm(initialCancellationForm);
    setCancelError("");
  };

  const submitCancellation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancelAppointment || !branchId) {
      return;
    }

    setIsSubmittingCancel(true);
    setCancelError("");

    try {
      await authorizedRequest(
        `/admin/appointments/${cancelAppointment.id}/cancel`,
        {
          method: "POST",
          body: {
            reason: cancelForm.reason,
            customerContacted: cancelForm.customerContacted,
            override: cancelForm.override,
            note: cancelForm.note || undefined,
          },
        },
      );
      setCancelAppointment(null);
      await loadData();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === "CANCELLATION_CUTOFF") {
          if (!overrideDisabled && !cancelForm.override) {
            setCancelError(
              "İptal süresi dolmuş. Yetkiniz varsa 'Zorla' seçeneğini işaretleyiniz.",
            );
          } else {
            setCancelError("İptal süresi dolmuş; lütfen Super Admin ile iletişime geçiniz.");
          }
        } else if (error.code === "OVERRIDE_NOT_ALLOWED") {
          setOverrideDisabledByBranch((previous) => ({
            ...previous,
            [branchId]: true,
          }));
          setCancelForm((previous) => ({
            ...previous,
            override: false,
          }));
          setCancelError("Bu işlem için yetkiniz bulunmamaktadır.");
        } else {
          setCancelError("İptal işlemi başarısız oldu.");
        }
      } else {
        setCancelError("İptal işlemi başarısız oldu.");
      }
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const requiresCustomerContacted =
    cancelForm.reason === "SERVICE_DISABLED" ||
    cancelForm.reason === "SERVICE_ISSUE";

  const disableBranchScopedUi = canSwitchBranch && !branchId;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
      {/* Calendar Header */}
      <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, viewMode === "day" ? -1 : -7))}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
              disabled={disableBranchScopedUi || isLoading}
            >
              <span className="material-icons">chevron_left</span>
            </button>
            <h2 className="text-lg font-bold min-w-[180px] text-center">
              {toIstanbulDateTimeLabel(getStartOfDayIso(selectedDate)).split(" ")[0]}
              {viewMode === "week" ? ` - ${toIstanbulDateTimeLabel(getStartOfDayIso(addDays(selectedDate, 6))).split(" ")[0]}` : ""}
            </h2>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, viewMode === "day" ? 1 : 7))}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
              disabled={disableBranchScopedUi || isLoading}
            >
              <span className="material-icons">chevron_right</span>
            </button>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("day")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                viewMode === "day" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700"
              }`}
              disabled={disableBranchScopedUi}
            >
              GÜN
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                viewMode === "week" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700"
              }`}
              disabled={disableBranchScopedUi}
            >
              HAFTA
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-primary">person_search</span>
            <select
              id="staff-filter"
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-full pl-10 pr-8 py-2 text-sm w-48 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none font-medium"
              value={staffFilter}
              onChange={(event) => setStaffFilter(event.target.value)}
              disabled={disableBranchScopedUi}
            >
              <option value="">Tüm Personel</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void loadData()}
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-primary transition-all relative"
            title="Yenile"
            disabled={isLoading}
          >
            <span className={`material-icons ${isLoading ? "animate-spin" : ""}`}>refresh</span>
          </button>
          <button
            onClick={openCreateEditor}
            disabled={disableBranchScopedUi}
            className="bg-primary text-zinc-900 px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-icons text-lg">add</span>
            Yeni Randevu
          </button>
        </div>
      </header>

      {/* Main Calendar Grid */}
      <div className="flex-1 overflow-auto p-6 relative">
        {errorMessage ? (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400">
            <span className="material-icons">error_outline</span>
            <p className="text-sm font-medium">{errorMessage}</p>
          </div>
        ) : null}

        <div className={`grid gap-6 ${viewMode === "day" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"}`}>
          {appointmentDayBuckets.map((bucket) => (
            <div key={bucket.day} className="flex flex-col gap-4">
              <div className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{getDayNumber(bucket.day)}</span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{getDayLabel(bucket.day)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {bucket.appointments.length === 0 ? (
                  <div className="py-8 px-4 rounded-xl border-2 border-dashed border-slate-100 dark:border-slate-800 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">Randevu Yok</span>
                  </div>
                ) : (
                  bucket.appointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      onClick={() => openEditEditor(appointment)}
                      className={`group relative p-4 rounded-xl border-l-4 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shadow-sm ${
                        focusAppointmentId === appointment.id
                          ? "bg-primary/10 border-primary ring-2 ring-primary/30"
                          : appointment.status === "CANCELLED"
                          ? "bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 opacity-60"
                          : "bg-white dark:bg-slate-900 border-primary hover:shadow-md"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-primary uppercase tracking-tighter">
                          {toIstanbulTimeLabel(appointment.startsAt)} - {toIstanbulTimeLabel(appointment.endsAt)}
                        </span>
                        {appointment.status === "CANCELLED" && (
                          <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black uppercase">İPTAL</span>
                        )}
                      </div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">
                        {appointment.customer.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mb-3">{appointment.customer.phone}</p>
                      
                      <div className="flex flex-wrap gap-1 mb-3">
                        {appointment.services.map(s => (
                          <span key={s.id} className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
                            {s.name}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="material-icons text-xs text-slate-400">person</span>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight">
                            {appointment.assignedStaff.name}
                          </span>
                        </div>
                        {appointment.status === "CONFIRMED" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCancelDialog(appointment);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all"
                            title="İptal Et"
                          >
                            <span className="material-icons text-sm">cancel</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Appointment Editor Modal */}
      {editorMode ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                  <span className="material-icons">{editorMode === "create" ? "add_circle" : "edit"}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editorMode === "create" ? "Yeni Randevu" : "Randevu Düzenle"}
                </h3>
              </div>
              <button onClick={() => setEditorMode(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                <span className="material-icons">close</span>
              </button>
            </div>

            <form className="p-6 space-y-5" onSubmit={submitEditor}>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">BAŞLANGIÇ (İSTANBUL)</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    value={editorState.startsAtInput}
                    onChange={(e) => setEditorState(p => ({ ...p, startsAtInput: e.target.value }))}
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">PERSONEL</label>
                  <select
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                    value={editorState.assignedStaffId}
                    onChange={(e) => setEditorState(p => ({ ...p, assignedStaffId: e.target.value }))}
                  >
                    <option value="">Personel seçiniz</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {editorMode === "create" && (
                  <>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">MÜŞTERİ ADI</label>
                      <input
                        required
                        placeholder="Örn: Ayşe Yılmaz"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={editorState.customerName}
                        onChange={(e) => setEditorState(p => ({ ...p, customerName: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">TELEFON</label>
                      <input
                        required
                        placeholder="05xx xxx xx xx"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={editorState.customerPhone}
                        onChange={(e) => setEditorState(p => ({ ...p, customerPhone: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">HİZMETLER</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer border border-transparent hover:border-primary/20">
                      <input
                        type="checkbox"
                        checked={editorState.serviceIds.includes(service.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                        onChange={(e) =>
                          setEditorState(p => ({
                            ...p,
                            serviceIds: e.target.checked
                              ? [...p.serviceIds, service.id]
                              : p.serviceIds.filter(id => id !== service.id),
                          }))
                        }
                      />
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight">
                        {service.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {editorError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2">
                  <span className="material-icons text-sm">error</span>
                  {editorError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditorMode(null)}
                  className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditor}
                  className="flex-[2] px-4 py-3 bg-primary text-zinc-900 rounded-xl text-sm font-black hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {isSubmittingEditor ? "Kaydediliyor..." : "Randevuyu Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Cancellation Side Panel */}
      {cancelAppointment ? (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-900/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 text-rose-500 rounded-xl flex items-center justify-center">
                  <span className="material-icons">cancel</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-rose-600">Randevu İptal Et</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Geri dönülemez işlem</p>
                </div>
              </div>
              <button onClick={() => setCancelAppointment(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">RANDEVU DETAYLARI</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500">Müşteri</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">{cancelAppointment.customer.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500">Tarih / Saat</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      {toIstanbulDateTimeLabel(cancelAppointment.startsAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-xs font-bold text-slate-500 shrink-0">Hizmetler</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-right">
                      {cancelAppointment.services.map(s => s.name).join(", ")}
                    </span>
                  </div>
                </div>
              </div>

              <form className="space-y-6" id="cancel-form" onSubmit={submitCancellation}>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">İptal Nedeni</label>
                  <select
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    value={cancelForm.reason}
                    onChange={(e) => setCancelForm(p => ({ ...p, reason: e.target.value as CancellationReason }))}
                  >
                    <option value="CUSTOMER_REQUEST">Müşteri Talebi</option>
                    <option value="SERVICE_DISABLED">Hizmet Kısıtlaması</option>
                    <option value="SERVICE_ISSUE">Hizmet/Personel Sorunu</option>
                  </select>
                </div>

                <div className="p-4 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10 flex items-center justify-between group cursor-pointer"
                     onClick={() => setCancelForm(p => ({ ...p, customerContacted: !p.customerContacted }))}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Müşteri Bilgilendirildi</span>
                    <span className="text-[10px] text-slate-500 font-medium italic">SMS veya Telefon ile ulaşıldı</span>
                  </div>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${cancelForm.customerContacted ? "bg-primary border-primary text-zinc-900" : "border-slate-300 text-transparent"}`}>
                    <span className="material-icons text-sm font-bold">check</span>
                  </div>
                </div>

                {!overrideDisabled ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                       onClick={() => setCancelForm(p => ({ ...p, override: !p.override }))}>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Kısıtlamayı Zorla</span>
                      <span className="text-[10px] text-slate-500 font-medium italic">Zaman sınırını görmezden gel</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={cancelForm.override} readOnly />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-lg border border-amber-100 dark:border-amber-900/30">
                    Süre aşımı nedeniyle kısıtlama yetkiniz bulunmamaktadır.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Notlar (Opsiyonel)</label>
                  <textarea
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="İptal hakkında ek bilgi..."
                    rows={3}
                    value={cancelForm.note}
                    onChange={(e) => setCancelForm(p => ({ ...p, note: e.target.value }))}
                  />
                </div>

                {requiresCustomerContacted && !cancelForm.customerContacted && (
                  <p className="text-[10px] text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/20 p-2 rounded-lg text-center">
                    Bu iptal nedeni için müşteriye ulaşıldığını onaylamanız gerekir.
                  </p>
                )}
                
                {cancelError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2">
                    <span className="material-icons text-sm">error</span>
                    {cancelError}
                  </div>
                )}
              </form>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3 shrink-0">
              <button
                onClick={() => setCancelAppointment(null)}
                className="flex-1 py-4 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Vazgeç
              </button>
              <button
                form="cancel-form"
                type="submit"
                disabled={isSubmittingCancel || (requiresCustomerContacted && !cancelForm.customerContacted)}
                className="flex-[2] py-4 bg-red-500 text-white font-black rounded-2xl shadow-xl shadow-red-500/20 hover:bg-red-600 transition-all disabled:opacity-50 disabled:grayscale"
              >
                {isSubmittingCancel ? "İşleniyor..." : "Randevuyu İptal Et"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}
