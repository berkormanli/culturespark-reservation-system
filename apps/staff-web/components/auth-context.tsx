"use client";

import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiClientError, apiRequest } from "../lib/api";
import { clearSession, readSession, writeSession } from "../lib/session";
import type { AdminUser, SessionData } from "../lib/types";

type LoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AdminUser;
};

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  session: SessionData | null;
  user: AdminUser | null;
  login: (args: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  authorizedRequest: <T>(
    path: string,
    options?: {
      method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isSessionExpired = (session: SessionData): boolean =>
  Date.now() >= session.expiresAt;

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      const stored = readSession();
      if (!stored || isSessionExpired(stored)) {
        clearSession();
        setStatus("unauthenticated");
        setSession(null);
        return;
      }

      try {
        const user = await apiRequest<AdminUser>("/admin/me", {
          token: stored.accessToken,
        });
        const hydratedSession: SessionData = {
          ...stored,
          user,
        };
        writeSession(hydratedSession);
        setSession(hydratedSession);
        setStatus("authenticated");
      } catch {
        clearSession();
        setSession(null);
        setStatus("unauthenticated");
      }
    };

    void hydrate();
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const login = useCallback(
    async (args: { email: string; password: string }) => {
      const response = await apiRequest<LoginResponse>("/admin/auth/login", {
        method: "POST",
        body: args,
      });

      const nextSession: SessionData = {
        accessToken: response.accessToken,
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
        user: response.user,
      };

      writeSession(nextSession);
      setSession(nextSession);
      setStatus("authenticated");
    },
    [],
  );

  const authorizedRequest = useCallback<AuthContextValue["authorizedRequest"]>(
    async (path, options) => {
      if (!session) {
        throw new ApiClientError({
          status: 401,
          code: "UNAUTHORIZED",
          message: "Authentication is required",
        });
      }

      try {
        const requestOptions: {
          token: string;
          method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
          body?: unknown;
          query?: Record<string, string | number | boolean | undefined>;
        } = {
          token: session.accessToken,
        };

        if (options?.method) {
          requestOptions.method = options.method;
        }
        if (options?.body !== undefined) {
          requestOptions.body = options.body;
        }
        if (options?.query) {
          requestOptions.query = options.query;
        }

        return await apiRequest(path, requestOptions);
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "UNAUTHORIZED") {
          logout();
        }
        throw error;
      }
    },
    [logout, session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      login,
      logout,
      authorizedRequest,
    }),
    [authorizedRequest, login, logout, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
