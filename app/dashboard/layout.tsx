"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  canAccessDashboardPath,
  getDefaultDashboardPath,
  getStoredStaffSession,
  validateStoredStaffSession,
} from "@/lib/services/auth";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    setAuthorized(false);

    async function checkAccess() {
      try {
        const session = await validateStoredStaffSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        if (!canAccessDashboardPath(session.role, pathname)) {
          router.replace(getDefaultDashboardPath(session.role));
          return;
        }

        setAuthorized(true);
      } catch {
        router.replace("/login");
      }
    }

    void checkAccess();
  }, [pathname, router]);

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080604] p-8 text-zinc-300">
        Checking access...
      </main>
    );
  }

  const session = getStoredStaffSession();
  const defaultDashboardPath = getDefaultDashboardPath(
    session?.role || "manager"
  );
  const showBackButton = pathname !== defaultDashboardPath;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(defaultDashboardPath);
  }

  return (
    <>
      {showBackButton && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="fixed left-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-2xl font-bold text-white shadow-xl backdrop-blur transition hover:bg-white/10 print:hidden"
        >
          &larr;
        </button>
      )}

      {children}
    </>
  );
}
