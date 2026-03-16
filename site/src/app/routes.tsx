import { ReactNode, useEffect, useState } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Welcome from "./pages/onboarding/Welcome";
import BasicProfile from "./pages/onboarding/BasicProfile";
import GoalSelection from "./pages/onboarding/GoalSelection";
import Dashboard from "./pages/Dashboard";
import GenerateSchedule from "./pages/GenerateSchedule";
import ScheduleBuilder from "./pages/ScheduleBuilder";
import ScheduleLibrary from "./pages/ScheduleLibrary";
import FourYearPlan from "./pages/FourYearPlan";
import DegreeAudit from "./pages/DegreeAudit";
import ProgramAudit from "./pages/ProgramAudit";
import GenEds from "./pages/GenEds";
import CreditImport from "./pages/CreditImport";
import DegreeRequirements from "./pages/DegreeRequirement";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Suggestions from "./pages/Suggestions";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import { getSupabaseClient } from "@/lib/supabase/client";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function RequireAuth({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setIsAuthed(Boolean(data.session?.user));
      } catch {
        if (!active) return;
        setIsAuthed(false);
      } finally {
        if (active) setChecking(false);
      }
    };

    void run();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsAuthed(Boolean(session?.user));
      setChecking(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>;
  }

  if (!isAuthed) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Welcome /> },
      { path: "onboarding/profile", element: <RequireAuth><BasicProfile /></RequireAuth> },
      { path: "onboarding/goals", element: <RequireAuth><GoalSelection /></RequireAuth> },
      { path: "dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "sign-in", element: <SignIn /> },
      { path: "generate-schedule", element: <RequireAuth><GenerateSchedule /></RequireAuth> },
      { path: "schedule-builder", element: <RequireAuth><ScheduleBuilder /></RequireAuth> },
      { path: "schedules", element: <RequireAuth><ScheduleLibrary /></RequireAuth> },
      { path: "build-my-week", element: <RequireAuth><ScheduleBuilder /></RequireAuth> }, // Redirect old route
      { path: "four-year-plan", element: <RequireAuth><FourYearPlan /></RequireAuth> },
      { path: "degree-audit", element: <RequireAuth><DegreeAudit /></RequireAuth> },
      { path: "audit/:programCode", element: <RequireAuth><ProgramAudit /></RequireAuth> },
      { path: "gen-eds", element: <RequireAuth><GenEds /></RequireAuth> },
      { path: "credit-import", element: <RequireAuth><CreditImport /></RequireAuth> },
      { path: "degree-requirements", element: <RequireAuth><DegreeRequirements /></RequireAuth> },
      { path: "profile", element: <RequireAuth><Profile /></RequireAuth> },
      { path: "suggestions", element: <RequireAuth><Suggestions /></RequireAuth> },
      { path: "settings", element: <RequireAuth><Settings /></RequireAuth> },
      { path: "*", element: <NotFound /> },
    ],
  },
], {
  basename: basePath === "" ? undefined : basePath,
});