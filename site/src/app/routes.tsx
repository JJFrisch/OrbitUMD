import { lazy, type ComponentType, ReactNode, Suspense, useEffect, useState } from "react";
import { isRouteErrorResponse, Link, Navigate, createBrowserRouter, useLocation, useRouteError } from "react-router";
import RootLayout from "./layouts/RootLayout";
import { getSupabaseClient } from "@/lib/supabase/client";
import { userNeedsOnboardingByEmail } from "@/lib/supabase/profileEmailGate";

function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  chunkName: string,
) {
  const retryKey = `orbitumd:lazy-retry:${chunkName}`;
  return lazy(async () => {
    try {
      const module = await loader();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(retryKey);
      }
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkFetchError = /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed/i.test(message);
      if (isChunkFetchError && typeof window !== "undefined") {
        const alreadyRetried = sessionStorage.getItem(retryKey) === "1";
        if (!alreadyRetried) {
          sessionStorage.setItem(retryKey, "1");
          window.location.reload();
          await new Promise<never>(() => {
            // Wait forever because reload should interrupt execution.
          });
        }
      }
      throw error;
    }
  });
}

const Welcome = lazyWithRetry(() => import("./pages/onboarding/Welcome"), "Welcome");
const OnboardingContainer = lazyWithRetry(() => import("./pages/onboarding/OnboardingContainer"), "OnboardingContainer");
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"), "Dashboard");
const GenerateSchedule = lazyWithRetry(() => import("./pages/GenerateSchedule"), "GenerateSchedule");
const ScheduleBuilder = lazyWithRetry(() => import("./pages/ScheduleBuilder"), "ScheduleBuilder");
const ScheduleLibrary = lazyWithRetry(() => import("./pages/ScheduleLibrary"), "ScheduleLibrary");
const FourYearPlan = lazyWithRetry(() => import("./pages/FourYearPlan"), "FourYearPlan");
const DegreeAudit = lazyWithRetry(() => import("./pages/DegreeAudit"), "DegreeAudit");
const ProgramAudit = lazyWithRetry(() => import("./pages/ProgramAudit"), "ProgramAudit");
const GenEds = lazyWithRetry(() => import("./pages/GenEds"), "GenEds");
const CreditImport = lazyWithRetry(() => import("./pages/CreditImport"), "CreditImport");
const DegreeRequirements = lazyWithRetry(() => import("./pages/DegreeRequirement"), "DegreeRequirements");
const Settings = lazyWithRetry(() => import("./pages/Settings"), "Settings");
const Suggestions = lazyWithRetry(() => import("./pages/Suggestions"), "Suggestions");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "NotFound");
const SignIn = lazyWithRetry(() => import("./pages/SignIn"), "SignIn");

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingRoute() {
  return <div className="p-6 text-sm text-muted-foreground">Loading page...</div>;
}

function withSuspense(children: ReactNode) {
  return <Suspense fallback={<LoadingRoute />}>{children}</Suspense>;
}

function AppRouteErrorBoundary() {
  const error = useRouteError();
  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Something unexpected went wrong while loading this page.";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl text-foreground mb-2">We hit a loading issue</h1>
      <p className="text-muted-foreground mb-6">{description}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          onClick={() => window.location.reload()}
        >
          Reload App
        </button>
        <Link
          to="/dashboard"
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-accent"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

function RequireAuth({
  children,
  allowMissingProfileEmail = false,
}: {
  children: ReactNode;
  allowMissingProfileEmail?: boolean;
}) {
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        const user = data.session?.user;
        setIsAuthed(Boolean(user));
        if (user) {
          const shouldOnboard = await userNeedsOnboardingByEmail(supabase, user.id);
          if (!active) return;
          setNeedsOnboarding(shouldOnboard);
        } else {
          setNeedsOnboarding(false);
        }
      } catch {
        if (!active) return;
        setIsAuthed(false);
        setNeedsOnboarding(false);
      } finally {
        if (active) setChecking(false);
      }
    };

    void run();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      const user = session?.user;
      setIsAuthed(Boolean(user));
      if (user) {
        const shouldOnboard = await userNeedsOnboardingByEmail(supabase, user.id);
        if (!active) return;
        setNeedsOnboarding(shouldOnboard);
      } else {
        setNeedsOnboarding(false);
      }
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

  if (!allowMissingProfileEmail && needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <AppRouteErrorBoundary />,
    children: [
      { index: true, element: withSuspense(<Welcome />) },
      { path: "onboarding", element: withSuspense(<RequireAuth allowMissingProfileEmail><OnboardingContainer /></RequireAuth>) },
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
      { path: "settings", element: withSuspense(<Settings />) },
      { path: "*", element: withSuspense(<NotFound />) },
    ],
  },
], {
  basename: basePath === "" ? undefined : basePath,
});