import { getSupabaseClient } from "@/lib/supabase/client";

let warmStarted = false;

async function runWarmup() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    return;
  }

  const [plannerModule, degreeProgramsModule, priorCreditsModule] = await Promise.all([
    import("@/lib/api/planner"),
    import("@/lib/repositories/degreeProgramsRepository"),
    import("@/lib/repositories/priorCreditsRepository"),
  ]);

  const dataWarmup = [
    plannerModule.plannerApi.listAllSchedulesWithSelections(),
    plannerModule.plannerApi.listFourYearPlans(),
    degreeProgramsModule.listUserDegreePrograms(),
    priorCreditsModule.listUserPriorCredits(),
    supabase
      .from("terms")
      .select("id, year, season, umd_term_code")
      .order("year", { ascending: false })
      .limit(16),
  ];

  await Promise.allSettled(dataWarmup);
}

export function warmOrbitAppData() {
  if (warmStarted || typeof window === "undefined") {
    return;
  }

  warmStarted = true;
  const run = () => {
    void runWarmup();
  };

  const win = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(run, { timeout: 2000 });
  } else {
    window.setTimeout(run, 400);
  }
}