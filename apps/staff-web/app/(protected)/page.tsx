"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function StaffRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/calendar");
  }, [router]);

  return <div>Redirecting...</div>;
}
