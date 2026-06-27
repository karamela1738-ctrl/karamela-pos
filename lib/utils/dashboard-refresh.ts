const DASHBOARD_REFRESH_STORAGE_KEY = "karamela_dashboard_refresh";
const DASHBOARD_REFRESH_EVENT = "karamela:dashboard-refresh";

export type DashboardRefreshReason =
  | "sale"
  | "waste"
  | "closing-stock"
  | "reconciliation";

export function triggerDashboardRefresh(reason: DashboardRefreshReason) {
  if (typeof window === "undefined") {
    return;
  }

  const marker = `${reason}:${Date.now()}`;
  window.localStorage.setItem(DASHBOARD_REFRESH_STORAGE_KEY, marker);
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_REFRESH_EVENT, {
      detail: marker,
    })
  );
}

export function subscribeDashboardRefresh(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === DASHBOARD_REFRESH_STORAGE_KEY) {
      callback();
    }
  };

  const handleRefreshEvent = () => {
    callback();
  };

  const handleFocus = () => {
    callback();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(
    DASHBOARD_REFRESH_EVENT,
    handleRefreshEvent as EventListener
  );
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(
      DASHBOARD_REFRESH_EVENT,
      handleRefreshEvent as EventListener
    );
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
