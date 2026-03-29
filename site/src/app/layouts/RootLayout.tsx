import { Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { PageOnboardingTour } from "../components/PageOnboardingTour";
import { warmOrbitAppData } from "@/lib/perf/warmOrbitAppData";

const SIDEBAR_KEY = "orbitumd:sidebar-collapsed";

function readCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { return false; }
}

export default function RootLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);

  useEffect(() => {
    const isPublic =
      location.pathname === "/"
      || location.pathname === "/sign-in"
      || location.pathname.includes("/onboarding");

    if (!isPublic) {
      warmOrbitAppData();
    }
  }, [location.pathname]);
  
  // Hide navigation on onboarding and welcome pages
  const isOnboarding =
    location.pathname === "/"
    || location.pathname.includes("/onboarding")
    || location.pathname === "/sign-in";

  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="orbit-shell h-screen bg-background flex overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => {
          const next = !prev;
          try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* noop */ }
          return next;
        })}
      />
      <div className="flex-1 flex flex-col min-h-0">
        <PageOnboardingTour />
        <main className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}