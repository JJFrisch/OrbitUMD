import { lazy, ReactNode, Suspense, useEffect, useState } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router";
import RootLayout from "./layouts/RootLayout";
import { getSupabaseClient } from "@/lib/supabase/client";

const Welcome = lazy(() => import("./pages/onboarding/Welcome"));
const BasicProfile = lazy(() => import("./pages/onboarding/BasicProfile"));
const GoalSelection = lazy(() => import("./pages/onboarding/GoalSelection"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const GenerateSchedule = lazy(() => import("./pages/GenerateSchedule"));
const ScheduleBuilder = lazy(() => import("./pages/ScheduleBuilder"));
const ScheduleLibrary = lazy(() => import("./pages/ScheduleLibrary"));
const FourYearPlan = lazy(() => import("./pages/FourYearPlan"));
const DegreeAudit = lazy(() => import("./pages/DegreeAudit"));
const ProgramAudit = lazy(() => import("./pages/ProgramAudit"));
const GenEds = lazy(() => import("./pages/GenEds"));
const CreditImport = lazy(() => import("./pages/CreditImport"));
const DegreeRequirements = lazy(() => import("./pages/DegreeRequirement"));
const Settings = lazy(() => import("./pages/Settings"));
const Suggestions = lazy(() => import("./pages/Suggestions"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SignIn = lazy(() => import("./pages/SignIn"));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingRoute() {
  return <div className="p-6 text-sm text-muted-foreground">Loading page...</div>;
}

function withSuspense(children: ReactNode) {
  return <Suspense fallback={<LoadingRoute />}>{children}</Suspense>;
}

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
      { index: true, element: withSuspense(<Welcome />) },
      { path: "onboarding/profile", element: withSuspense(<RequireAuth><BasicProfile /></RequireAuth>) },
      { path: "onboarding/goals", element: withSuspense(<RequireAuth><GoalSelection /></RequireAuth>) },
      { path: "dashboard", element: withSuspense(<RequireAuth><Dashboard /></RequireAuth>) },
      { path: "sign-in", element: withSuspense(<SignIn />) },
      { path: "generate-schedule", element: withSuspense(<RequireAuth><GenerateSchedule /></RequireAuth>) },
      { path: "schedule-builder", element: withSuspense(<RequireAuth><ScheduleBuilder /></RequireAuth>) },
      { path: "schedules", element: withSuspense(<RequireAuth><ScheduleLibrary /></RequireAuth>) },
      { path: "build-my-week", element: withSuspense(<RequireAuth><ScheduleBuilder /></RequireAuth>) },
      { path: "four-year-plan", element: withSuspense(<RequireAuth><FourYearPlan /></RequireAuth>) },
      { path: "degree-audit", element: withSuspense(<RequireAuth><DegreeAudit /></RequireAuth>) },
      { path: "audit/:programCode", element: withSuspense(<RequireAuth><ProgramAudit /></RequireAuth>) },
      { path: "gen-eds", element: withSuspense(<RequireAuth><GenEds /></RequireAuth>) },
      { path: "credit-import", element: withSuspense(<RequireAuth><CreditImport /></RequireAuth>) },
      { path: "degree-requirements", element: withSuspense(<RequireAuth><DegreeRequirements /></RequireAuth>) },
      { path: "suggestions", element: withSuspense(<RequireAuth><Suggestions /></RequireAuth>) },
      { path: "settings", element: withSuspense(<RequireAuth><Settings /></RequireAuth>) },
      { path: "*", element: withSuspense(<NotFound />) },
    ],
  },
], {
  basename: basePath === "" ? undefined : basePath,
});