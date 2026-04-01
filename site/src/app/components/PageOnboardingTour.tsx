import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type TourStep = {
  title: string;
  description: string;
  targetSelector?: string;
};

type TourDefinition = {
  key: string;
  label: string;
  matchPath: (path: string) => boolean;
  steps: TourStep[];
};

const TOUR_PREFIX = "orbitumd:tour-seen:";
const TOUR_RESET_EVENT = "orbitumd:tours-reset";

type PositionedCard = {
  top: number;
  left: number;
  centered: boolean;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    matchPath: (path) => path === "/dashboard",
    steps: [
      {
        title: "Welcome to your Dashboard",
        description: "This page gives a quick snapshot of completed, in-progress, and planned work.",
        targetSelector: '[data-tour-target="dashboard-term-overview"]',
      },
      {
        title: "Use Cards for Next Actions",
        description: "The recommendation cards point you to the fastest next step based on your current plan.",
        targetSelector: '[data-tour-target="dashboard-next-actions"]',
      },
      {
        title: "Keep Data Fresh",
        description: "Your dashboard updates automatically after you edit schedules, requirements, or profile settings.",
        targetSelector: '[data-tour-target="dashboard-program-progress"]',
      },
    ],
  },
  {
    key: "schedule-builder",
    label: "Edit Schedule",
    matchPath: (path) => path === "/schedule-builder" || path === "/build-my-week",
    steps: [
      {
        title: "Search and Add Courses",
        description: "Use the left panel to search by course code, title, instructor, or Gen Ed tags.",
        targetSelector: '[data-tour-target="schedule-search-panel"]',
      },
      {
        title: "Build Your Week",
        description: "Drop sections into the schedule to compare conflicts and see your weekly time layout.",
        targetSelector: '[data-tour-target="schedule-calendar"]',
      },
      {
        title: "Save Schedules",
        description: "Save often, then mark the best schedule as MAIN in the library to drive planning pages.",
        targetSelector: '[data-tour-target="schedule-save-controls"]',
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
        targetSelector: '[data-tour-target="degree-audit-summary"]',
      },
      {
        title: "Expand Requirement Details",
        description: "Open section details to see specific courses that satisfy each part of a requirement.",
        targetSelector: '[data-tour-target="degree-audit-programs"]',
      },
      {
        title: "Track Gaps",
        description: "Use highlighted gaps to decide what classes to add in upcoming terms.",
        targetSelector: '[data-tour-target="degree-audit-actions"]',
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
        targetSelector: '[data-tour-target="four-year-timeline"]',
      },
      {
        title: "Monitor Workload",
        description: "Credits and course counts help you keep each term realistic before registration.",
        targetSelector: '[data-tour-target="four-year-summary"]',
      },
      {
        title: "Review Contribution Badges",
        description: "Badges show which planned courses actively satisfy your selected program requirements.",
        targetSelector: '[data-tour-target="four-year-manage-main"]',
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    matchPath: (path) => path === "/settings",
    steps: [
      {
        title: "Profile Basics",
        description: "Keep your full name, email, and UID updated here so planning pages stay personalized.",
        targetSelector: '[data-tour-target="settings-profile"]',
      },
      {
        title: "Academic Information",
        description: "Manage majors/minors and graduation targets in Academic Information.",
        targetSelector: '[data-tour-target="settings-academic"]',
      },
      {
        title: "Preferences and Guide Replay",
        description: "Save planner defaults and use the replay control to re-open these page guides anytime.",
        targetSelector: '[data-tour-target="settings-preferences"]',
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

function clearSeenTour(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${TOUR_PREFIX}${key}`);
}

export function resetAllPageTours() {
  for (const tour of TOUR_DEFINITIONS) {
    clearSeenTour(tour.key);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOUR_RESET_EVENT));
  }
}

function computeCardPosition(target: Element | null): PositionedCard {
  const maxWidth = 380;
  const margin = 12;

  if (!target) {
    const centerTop = Math.max(80, Math.floor(window.innerHeight * 0.2));
    const centerLeft = Math.max(margin, Math.floor((window.innerWidth - maxWidth) / 2));
    return { top: centerTop, left: centerLeft, centered: true };
  }

  const rect = target.getBoundingClientRect();
  const preferredTop = rect.bottom + margin;
  const fallbackTop = Math.max(margin, rect.top - 220);
  const top = preferredTop + 220 <= window.innerHeight ? preferredTop : fallbackTop;

  const preferredLeft = rect.left;
  const maxLeft = Math.max(margin, window.innerWidth - maxWidth - margin);
  const left = Math.min(Math.max(margin, preferredLeft), maxLeft);

  return { top, left, centered: false };
}

function computeHighlightRect(target: Element | null): HighlightRect | null {
  if (!target) return null;

  const rect = target.getBoundingClientRect();
  const padding = 6;

  return {
    top: Math.max(4, rect.top - padding),
    left: Math.max(4, rect.left - padding),
    width: Math.max(12, rect.width + padding * 2),
    height: Math.max(12, rect.height + padding * 2),
  };
}

export function PageOnboardingTour() {
  const location = useLocation();
  const [activeTourKey, setActiveTourKey] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState<PositionedCard>({ top: 80, left: 24, centered: true });
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const activeTour = useMemo(
    () => TOUR_DEFINITIONS.find((tour) => tour.key === activeTourKey) ?? null,
    [activeTourKey],
  );

  const closeTour = useCallback(() => {
    if (!activeTour) return;
    markSeenTour(activeTour.key);
    setActiveTourKey(null);
    setStepIndex(0);
  }, [activeTour]);

  const syncPosition = useCallback(() => {
    if (!activeTour) return;
    const step = activeTour.steps[stepIndex];
    const target = step.targetSelector ? document.querySelector(step.targetSelector) : null;
    setPosition(computeCardPosition(target));
    setHighlightRect(computeHighlightRect(target));
  }, [activeTour, stepIndex]);

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

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempts = 0;
    const maxAttempts = 12;

    const tryActivateTour = () => {
      if (cancelled) return;

      const firstSelector = match.steps[0]?.targetSelector;
      const firstTargetReady = !firstSelector || Boolean(document.querySelector(firstSelector));

      if (firstTargetReady) {
        setActiveTourKey(match.key);
        setStepIndex(0);
        return;
      }

      if (attempts >= maxAttempts) {
        return;
      }

      attempts += 1;
      timeoutId = window.setTimeout(tryActivateTour, 150);
    };

    timeoutId = window.setTimeout(tryActivateTour, 350);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [location.pathname]);

  useEffect(() => {
    const onReset = () => {
      const match = TOUR_DEFINITIONS.find((tour) => tour.matchPath(location.pathname));
      if (!match) return;

      setActiveTourKey(match.key);
      setStepIndex(0);
    };

    window.addEventListener(TOUR_RESET_EVENT, onReset);
    return () => window.removeEventListener(TOUR_RESET_EVENT, onReset);
  }, [location.pathname]);

  useEffect(() => {
    if (!activeTour) return;

    syncPosition();
    const onViewportChange = () => syncPosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [activeTour, stepIndex, syncPosition]);

  useEffect(() => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--tour-card-top", `${position.top}px`);
    cardRef.current.style.setProperty("--tour-card-left", `${position.left}px`);
  }, [position.left, position.top]);

  useEffect(() => {
    if (!highlightRef.current || !highlightRect) return;
    highlightRef.current.style.setProperty("--tour-highlight-top", `${highlightRect.top}px`);
    highlightRef.current.style.setProperty("--tour-highlight-left", `${highlightRect.left}px`);
    highlightRef.current.style.setProperty("--tour-highlight-width", `${highlightRect.width}px`);
    highlightRef.current.style.setProperty("--tour-highlight-height", `${highlightRect.height}px`);
  }, [highlightRect]);

  if (!activeTour) {
    return null;
  }

  const step = activeTour.steps[stepIndex];
  const isLast = stepIndex >= activeTour.steps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-none absolute inset-0 bg-black/35" />

      {highlightRect && (
        <div
          ref={highlightRef}
          className="pointer-events-none absolute top-[var(--tour-highlight-top)] left-[var(--tour-highlight-left)] w-[var(--tour-highlight-width)] h-[var(--tour-highlight-height)] rounded-lg border-2 border-red-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]"
        />
      )}

      <Card
        ref={cardRef}
        role="dialog"
        aria-label={`${activeTour.label} guide`}
        className="pointer-events-auto absolute top-[var(--tour-card-top)] left-[var(--tour-card-left)] w-[min(380px,calc(100vw-24px))] border-border bg-popover p-4 shadow-xl"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{activeTour.label} Guide</h2>
          <p className="text-xs text-muted-foreground">Step {stepIndex + 1} of {activeTour.steps.length}</p>
        </div>

        <h3 className="text-sm font-medium text-foreground mb-1">{step.title}</h3>
        <p className="text-sm text-muted-foreground">{step.description}</p>

        {position.centered && (
          <p className="mt-3 text-xs text-muted-foreground">
            This tip is shown in the center because the referenced UI element is not currently visible.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={closeTour}>Skip</Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}>Back</Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={closeTour}>Done</Button>
            ) : (
              <Button size="sm" onClick={() => setStepIndex((prev) => prev + 1)}>Next</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}