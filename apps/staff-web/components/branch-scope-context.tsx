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
import { apiRequest } from "../lib/api";
import {
  clearSelectedBranchId,
  readSelectedBranchId,
  writeSelectedBranchId,
} from "../lib/session";
import type { BranchSummary } from "../lib/types";
import { useAuth } from "./auth-context";

type BranchScopeContextValue = {
  branches: BranchSummary[];
  branchesLoading: boolean;
  selectedBranchId: string;
  selectedBranch: BranchSummary | null;
  canSwitchBranch: boolean;
  setSelectedBranchId: (branchId: string) => void;
};

type BranchListResponse = {
  items: BranchSummary[];
  pagination: {
    page: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
};

const BranchScopeContext = createContext<BranchScopeContextValue | undefined>(
  undefined,
);

export const BranchScopeProvider = ({ children }: PropsWithChildren) => {
  const { status, user } = useAuth();
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchIdState] = useState("");

  useEffect(() => {
    const clearState = () => {
      setBranches([]);
      setBranchesLoading(false);
      setSelectedBranchIdState("");
      clearSelectedBranchId();
    };

    if (status !== "authenticated" || !user) {
      clearState();
      return;
    }

    if (user.role === "BRANCH_ADMIN") {
      setSelectedBranchIdState(user.branchId ?? "");
      return;
    }

    const loadBranches = async () => {
      setBranchesLoading(true);
      try {
        const response = await apiRequest<BranchListResponse>(
          "/public/branches",
          {
            query: { page: 1, size: 50 },
          },
        );
        setBranches(response.items);

        const storedBranchId = readSelectedBranchId();
        const hasStoredBranch = response.items.some(
          (branch) => branch.id === storedBranchId,
        );
        setSelectedBranchIdState(hasStoredBranch ? storedBranchId : "");
      } finally {
        setBranchesLoading(false);
      }
    };

    void loadBranches();
  }, [status, user]);

  const setSelectedBranchId = useCallback(
    (branchId: string) => {
      if (user?.role !== "SUPER_ADMIN") {
        return;
      }

      setSelectedBranchIdState(branchId);
      if (branchId) {
        writeSelectedBranchId(branchId);
      } else {
        clearSelectedBranchId();
      }
    },
    [user?.role],
  );

  const value = useMemo<BranchScopeContextValue>(() => {
    const selectedBranch =
      branches.find((branch) => branch.id === selectedBranchId) ?? null;
    return {
      branches,
      branchesLoading,
      selectedBranchId,
      selectedBranch,
      canSwitchBranch: user?.role === "SUPER_ADMIN",
      setSelectedBranchId,
    };
  }, [branches, branchesLoading, selectedBranchId, setSelectedBranchId, user]);

  return (
    <BranchScopeContext.Provider value={value}>
      {children}
    </BranchScopeContext.Provider>
  );
};

export const useBranchScope = (): BranchScopeContextValue => {
  const context = useContext(BranchScopeContext);
  if (!context) {
    throw new Error("useBranchScope must be used within BranchScopeProvider");
  }

  return context;
};
