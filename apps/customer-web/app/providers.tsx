"use client";

import type { ReactNode } from "react";
import { BookingFlowProvider } from "../lib/booking-flow";

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <BookingFlowProvider>{children}</BookingFlowProvider>
);
