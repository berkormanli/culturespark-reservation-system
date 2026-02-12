"use client";

import type { PublicAppointment } from "@culturespark/api-client";
import { StaffPreferenceMode } from "@culturespark/shared";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

type SelectedService = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
};

type BookingState = {
  branchId: string | null;
  branchName: string | null;
  serviceIds: string[];
  selectedServices: SelectedService[];
  preferenceType: StaffPreferenceMode | null;
  requestedStaffId: string | null;
  requestedStaffName: string | null;
  date: string | null;
  selectedStartsAt: string | null;
  slotIntervalMinutes: number | null;
  allowAlternateStaff: boolean;
  customerName: string;
  customerPhone: string;
  idempotencyKey: string | null;
  idempotencySelectionSignature: string | null;
  confirmedAppointment: PublicAppointment | null;
};

type BookingAction =
  | {
      type: "hydrate";
      payload: BookingState;
    }
  | {
      type: "selectBranch";
      payload: { branchId: string; branchName: string };
    }
  | {
      type: "setServices";
      payload: { serviceIds: string[]; selectedServices: SelectedService[] };
    }
  | {
      type: "setPreference";
      payload: StaffPreferenceMode;
    }
  | {
      type: "setRequestedStaff";
      payload: { requestedStaffId: string; requestedStaffName: string };
    }
  | {
      type: "clearRequestedStaff";
    }
  | {
      type: "setDate";
      payload: string;
    }
  | {
      type: "selectSlot";
      payload: { startsAt: string; slotIntervalMinutes: number };
    }
  | {
      type: "setAllowAlternateStaff";
      payload: boolean;
    }
  | {
      type: "setCustomerDetails";
      payload: { customerName: string; customerPhone: string };
    }
  | {
      type: "setIdempotency";
      payload: { key: string; selectionSignature: string };
    }
  | {
      type: "setConfirmedAppointment";
      payload: PublicAppointment;
    }
  | {
      type: "clearConfirmedAppointment";
    }
  | {
      type: "resetBooking";
    };

const BOOKING_STORAGE_KEY = "culturespark.customer.booking";

const emptyState: BookingState = {
  branchId: null,
  branchName: null,
  serviceIds: [],
  selectedServices: [],
  preferenceType: null,
  requestedStaffId: null,
  requestedStaffName: null,
  date: null,
  selectedStartsAt: null,
  slotIntervalMinutes: null,
  allowAlternateStaff: false,
  customerName: "",
  customerPhone: "",
  idempotencyKey: null,
  idempotencySelectionSignature: null,
  confirmedAppointment: null,
};

const resetForSelectionChange = (state: BookingState): BookingState => ({
  ...state,
  selectedStartsAt: null,
  slotIntervalMinutes: null,
  allowAlternateStaff: false,
  idempotencyKey: null,
  idempotencySelectionSignature: null,
  confirmedAppointment: null,
});

const bookingReducer = (
  state: BookingState,
  action: BookingAction,
): BookingState => {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "selectBranch":
      if (state.branchId === action.payload.branchId) {
        return state;
      }
      return {
        ...emptyState,
        branchId: action.payload.branchId,
        branchName: action.payload.branchName,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
      };
    case "setServices":
      return {
        ...resetForSelectionChange(state),
        serviceIds: action.payload.serviceIds,
        selectedServices: action.payload.selectedServices,
        preferenceType: state.preferenceType,
        requestedStaffId: null,
        requestedStaffName: null,
      };
    case "setPreference":
      return {
        ...resetForSelectionChange(state),
        preferenceType: action.payload,
        requestedStaffId:
          action.payload === StaffPreferenceMode.ANY
            ? null
            : state.requestedStaffId,
        requestedStaffName:
          action.payload === StaffPreferenceMode.ANY
            ? null
            : state.requestedStaffName,
      };
    case "setRequestedStaff":
      return {
        ...resetForSelectionChange(state),
        requestedStaffId: action.payload.requestedStaffId,
        requestedStaffName: action.payload.requestedStaffName,
      };
    case "clearRequestedStaff":
      return {
        ...resetForSelectionChange(state),
        requestedStaffId: null,
        requestedStaffName: null,
      };
    case "setDate":
      if (state.date === action.payload) {
        return state;
      }
      return {
        ...resetForSelectionChange(state),
        date: action.payload,
      };
    case "selectSlot":
      return {
        ...state,
        selectedStartsAt: action.payload.startsAt,
        slotIntervalMinutes: action.payload.slotIntervalMinutes,
        idempotencyKey: null,
        idempotencySelectionSignature: null,
        confirmedAppointment: null,
      };
    case "setAllowAlternateStaff":
      if (state.allowAlternateStaff === action.payload) {
        return state;
      }
      return {
        ...state,
        allowAlternateStaff: action.payload,
        idempotencyKey: null,
        idempotencySelectionSignature: null,
        confirmedAppointment: null,
      };
    case "setCustomerDetails":
      return {
        ...state,
        customerName: action.payload.customerName,
        customerPhone: action.payload.customerPhone,
      };
    case "setIdempotency":
      return {
        ...state,
        idempotencyKey: action.payload.key,
        idempotencySelectionSignature: action.payload.selectionSignature,
      };
    case "setConfirmedAppointment":
      return {
        ...state,
        confirmedAppointment: action.payload,
      };
    case "clearConfirmedAppointment":
      return {
        ...state,
        confirmedAppointment: null,
      };
    case "resetBooking":
      return emptyState;
    default:
      return state;
  }
};

const isSelectedService = (value: unknown): value is SelectedService => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const id = Reflect.get(value, "id");
  const name = Reflect.get(value, "name");
  const durationMinutes = Reflect.get(value, "durationMinutes");
  const bufferMinutes = Reflect.get(value, "bufferMinutes");

  return (
    typeof id === "string" &&
    typeof name === "string" &&
    typeof durationMinutes === "number" &&
    typeof bufferMinutes === "number"
  );
};

const parseStoredState = (raw: string | null): BookingState | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BookingState>;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const serviceIds = Array.isArray(parsed.serviceIds)
      ? parsed.serviceIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const selectedServices = Array.isArray(parsed.selectedServices)
      ? parsed.selectedServices.filter(isSelectedService)
      : [];

    return {
      ...emptyState,
      branchId: typeof parsed.branchId === "string" ? parsed.branchId : null,
      branchName:
        typeof parsed.branchName === "string" ? parsed.branchName : null,
      serviceIds,
      selectedServices,
      preferenceType:
        parsed.preferenceType === StaffPreferenceMode.ANY ||
        parsed.preferenceType === StaffPreferenceMode.PREFERRED ||
        parsed.preferenceType === StaffPreferenceMode.REQUIRED
          ? parsed.preferenceType
          : null,
      requestedStaffId:
        typeof parsed.requestedStaffId === "string"
          ? parsed.requestedStaffId
          : null,
      requestedStaffName:
        typeof parsed.requestedStaffName === "string"
          ? parsed.requestedStaffName
          : null,
      date: typeof parsed.date === "string" ? parsed.date : null,
      selectedStartsAt:
        typeof parsed.selectedStartsAt === "string"
          ? parsed.selectedStartsAt
          : null,
      slotIntervalMinutes:
        typeof parsed.slotIntervalMinutes === "number"
          ? parsed.slotIntervalMinutes
          : null,
      allowAlternateStaff: parsed.allowAlternateStaff === true,
      customerName:
        typeof parsed.customerName === "string" ? parsed.customerName : "",
      customerPhone:
        typeof parsed.customerPhone === "string" ? parsed.customerPhone : "",
      idempotencyKey:
        typeof parsed.idempotencyKey === "string"
          ? parsed.idempotencyKey
          : null,
      idempotencySelectionSignature:
        typeof parsed.idempotencySelectionSignature === "string"
          ? parsed.idempotencySelectionSignature
          : null,
      confirmedAppointment: parsed.confirmedAppointment ?? null,
    };
  } catch {
    return null;
  }
};

type BookingContextValue = {
  state: BookingState;
  actions: {
    selectBranch: (payload: { branchId: string; branchName: string }) => void;
    setServices: (payload: {
      serviceIds: string[];
      selectedServices: SelectedService[];
    }) => void;
    setPreference: (mode: StaffPreferenceMode) => void;
    setRequestedStaff: (payload: {
      requestedStaffId: string;
      requestedStaffName: string;
    }) => void;
    clearRequestedStaff: () => void;
    setDate: (date: string) => void;
    selectSlot: (payload: {
      startsAt: string;
      slotIntervalMinutes: number;
    }) => void;
    setAllowAlternateStaff: (value: boolean) => void;
    setCustomerDetails: (payload: {
      customerName: string;
      customerPhone: string;
    }) => void;
    setIdempotency: (payload: {
      key: string;
      selectionSignature: string;
    }) => void;
    setConfirmedAppointment: (appointment: PublicAppointment) => void;
    clearConfirmedAppointment: () => void;
    resetBooking: () => void;
  };
};

const BookingContext = createContext<BookingContextValue | null>(null);

export const BookingFlowProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(bookingReducer, emptyState);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const stored = parseStoredState(
      sessionStorage.getItem(BOOKING_STORAGE_KEY),
    );
    if (stored) {
      dispatch({ type: "hydrate", payload: stored });
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<BookingContextValue>(
    () => ({
      state,
      actions: {
        selectBranch: (payload) => dispatch({ type: "selectBranch", payload }),
        setServices: (payload) => dispatch({ type: "setServices", payload }),
        setPreference: (payload) =>
          dispatch({ type: "setPreference", payload }),
        setRequestedStaff: (payload) =>
          dispatch({ type: "setRequestedStaff", payload }),
        clearRequestedStaff: () => dispatch({ type: "clearRequestedStaff" }),
        setDate: (payload) => dispatch({ type: "setDate", payload }),
        selectSlot: (payload) => dispatch({ type: "selectSlot", payload }),
        setAllowAlternateStaff: (payload) =>
          dispatch({ type: "setAllowAlternateStaff", payload }),
        setCustomerDetails: (payload) =>
          dispatch({ type: "setCustomerDetails", payload }),
        setIdempotency: (payload) =>
          dispatch({ type: "setIdempotency", payload }),
        setConfirmedAppointment: (payload) =>
          dispatch({ type: "setConfirmedAppointment", payload }),
        clearConfirmedAppointment: () =>
          dispatch({ type: "clearConfirmedAppointment" }),
        resetBooking: () => dispatch({ type: "resetBooking" }),
      },
    }),
    [state],
  );

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  );
};

export const useBookingFlow = (): BookingContextValue => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error("useBookingFlow must be used within BookingFlowProvider");
  }

  return context;
};

export type { BookingState, SelectedService };
