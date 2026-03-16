import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type TourStep = {
  title: string;
  description: string;
};

type TourDefinition = {
  key: string;
  label: string;
  matchPath: (path: string) => boolean;
  steps: TourStep[];
};

const TOUR_PREFIX = "orbitumd:tour-seen:";

const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    matchPath: (path) => path === "/dashboard",
    steps: [
      {
        title: "Welcome to your Dashboard",
        description: "This page gives a quick snapshot of completed, in-progress, and planned work.",
      },
      {
        title: "Use Cards for Next Actions",
        description: "The recommendation cards point you to the fastest next step based on your current plan.",
      },
      {
        title: "Keep Data Fresh",
        description: "Your dashboard updates automatically after you edit schedules, requirements, or profile settings.",
      },
    ],
  },
  {
    key: "schedule-builder",
    label: "Schedule Builder",
    matchPath: (path) => path === "/schedule-builder" || path === "/build-my-week",
    steps: [
      {
        title: "Search and Add Courses",
        description: "Use the left panel to search by course code, title, instructor, or Gen Ed tags.",
      },
      {
        title: "Build Your Week",
        description: "Drop sections into the schedule to compare conflicts and see your weekly time layout.",
      },
      {
        title: "Save Schedules",
        description: "Save often, then mark the best schedule as MAIN in the library to drive planning pages.",
      },
    ],
  },
  {
    key: "degree-audit",
    label: "Degree Audit",
    matchPath: (path) => path === "/degree-audit" || path.startsWith("/audit/"),
    steps: [
      {
        title: "Read Requirement Progress",
        description: "Each section shows completion status using your planned schedules and imported credits.",
      },
      {
        title: "Expand Requirement Details",
        description: "Open section details to see specific courses that satisfy each part of a requirement.",
      },
      {
        title: "Track Gaps",
        description: "Use highlighted gaps to decide what classes to add in upcoming terms.",
      },
    ],
  },
  {
    key: "four-year-plan",
    label: "Four-Year Plan",
    matchPath: (path) => path === "/four-year-plan",
    steps: [
      {
        title: "Term-by-Term Timeline",
        description: "This page arranges your MAIN schedules and prior credit history into one timeline.",
      },
      {
        title: "Monitor Workload",
        description: "Credits and course counts help you keep each term realistic before registration.",
      },
      {
        title: "Review Contribution Badges",
        description: "Badges show which planned courses actively satisfy your selected program requirements.",
      },
    ],
  },
];

function readSeenTour(key: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(`${TOUR_PREFIX}${key}`) === "true";
}

function markSeenTour(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${TOUR_PREFIX}${key}`, "true");
}

export function PageOnboardingTour() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTourKey, setActiveTourKey] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const activeTour = useMemo(
    () => TOUR_DEFINITIONS.find((tour) => tour.key === activeTourKey) ?? null,
    [activeTourKey],
  );

  useEffect(() => {
    const path = location.pathname;
    const isPublic = path === "/" || path === "/sign-in" || path.includes("/onboarding");
    if (isPublic) {
      setActiveTourKey(null);
      setStepIndex(0);
      return;
    }

    const match = TOUR_DEFINITIONS.find((tour) => tour.matchPath(path));
    if (!match) {
      setActiveTourKey(null);
      setStepIndex(0);
      return;
    }

    if (readSeenTour(match.key)) {
      setActiveTourKey(null);
      setStepIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveTourKey(match.key);
      setStepIndex(0);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [location.pathname]);

  if (!activeTour) {
    return null;
  }

  const step = activeTour.steps[stepIndex];
  const isLast = stepIndex >= activeTour.steps.length - 1;

  return (
    <Dialog
      open={Boolean(activeTour)}
      onOpenChange={(open) => {
        if (!open) {
          markSeenTour(activeTour.key);
          setActiveTourKey(null);
          setStepIndex(0);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activeTour.label} Tour</DialogTitle>
          <DialogDescription>Step {stepIndex + 1} of {activeTour.steps.length}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-base font-semibold">{step.title}</h3>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              markSeenTour(activeTour.key);
              setActiveTourKey(null);
              setStepIndex(0);
            }}
          >
            Skip
          </Button>
          {isLast ? (
            <Button
              onClick={() => {
                markSeenTour(activeTour.key);
                setActiveTourKey(null);
                setStepIndex(0);
              }}
            >
              Done
            </Button>
          ) : (
            <Button onClick={() => setStepIndex((prev) => prev + 1)}>Next</Button>
          )}
        </DialogFooter>

        <div className="text-xs text-muted-foreground">
          Want this tour again? Visit
          <button
            type="button"
            className="ml-1 underline"
            onClick={() => navigate("/suggestions")}
          >
            Suggestions & Help
          </button>
          and request a reset.
        </div>
      </DialogContent>
    </Dialog>
  );
}