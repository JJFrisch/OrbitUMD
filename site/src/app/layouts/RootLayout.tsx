import { Outlet, useLocation } from "react-router";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

export default function RootLayout() {
  const location = useLocation();
  
  // Hide navigation on onboarding and welcome pages
  const isOnboarding = location.pathname === "/" || location.pathname.includes("/onboarding");

  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}