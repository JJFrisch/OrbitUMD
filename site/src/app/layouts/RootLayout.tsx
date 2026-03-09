import { Outlet, useLocation } from "react-router";
import { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

const SIDEBAR_KEY = "orbitumd:sidebar-collapsed";

function readCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { return false; }
}

export default function RootLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  
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
    <div className="min-h-screen bg-background flex">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => {
          const next = !prev;
          try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* noop */ }
          return next;
        })}
      />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}