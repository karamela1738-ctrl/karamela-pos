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
  const [authorizedPath, setAuthorizedPath] = useState<string | null>(null);

  const authorized = authorizedPath === pathname;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const session = await validateStoredStaffSession();

          if (!session) {
            router.replace("/login");
            return;
          }

          if (pathname === "/dashboard/admin") {
            setAuthorizedPath(pathname);
            return;
          }

          if (!canAccessDashboardPath(session.role, pathname)) {
            router.replace(getDefaultDashboardPath(session.role));
            return;
          }

          setAuthorizedPath(pathname);
        } catch {
          router.replace("/login");
        }
      })();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [pathname, router]);

  if (!authorized) {
    return (
      <main className="dashboard-page-shell-centered text-zinc-300">
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
          className="safe-fixed-top-left fixed z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/60 text-xl font-bold text-white shadow-xl backdrop-blur transition hover:bg-white/10 print:hidden sm:h-12 sm:w-12 sm:text-2xl"
        >
          &larr;
        </button>
      )}

      {children}
    </>
  );
}
