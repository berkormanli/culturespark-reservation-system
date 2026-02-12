import type { PropsWithChildren } from "react";
import { Suspense } from "react";
import { ProtectedShell } from "../../components/protected-shell";

export default function ProtectedLayout({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={null}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}
