import { plannerApi } from "@/lib/api/planner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Search, User, ChevronDown, Lightbulb, Settings, LogOut, CircleHelp } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type CourseSearchHit = {
  id: string;
  title: string;
  credits: number;
};

type SiteSearchTarget = {
  label: string;
  description: string;
  path: string;
  keywords: string[];
};

const SEARCH_TARGETS: SiteSearchTarget[] = [
  {
    label: "Dashboard",
    description: "Progress snapshots, requirement health, and quick actions.",
    path: "/dashboard",
    keywords: ["home", "overview", "progress", "dashboard"],
  },
  {
    label: "Schedule Builder",
    description: "Build schedules, search classes, and compare sections.",
    path: "/schedule-builder",
    keywords: ["schedule", "build", "planner", "classes", "testudo"],
  },
  {
    label: "Schedule Library",
    description: "Manage all saved schedules across terms.",
    path: "/schedules",
    keywords: ["library", "saved", "main", "schedules"],
  },
  {
    label: "Four-Year Plan",
    description: "See your long-range term-by-term plan.",
    path: "/four-year-plan",
    keywords: ["four year", "timeline", "plan", "graduation"],
  },
  {
    label: "Degree Audit",
    description: "Track requirement completion and outstanding sections.",
    path: "/degree-audit",
    keywords: ["audit", "requirements", "major", "minor", "degree"],
  },
  {
    label: "Gen Eds",
    description: "Browse and satisfy Maryland General Education requirements.",
    path: "/gen-eds",
    keywords: ["gen ed", "gened", "distributive", "fundamental"],
  },
  {
    label: "Profile",
    description: "Manage your account profile and contact details.",
    path: "/profile",
    keywords: ["profile", "account", "name", "email"],
  },
  {
    label: "Settings",
    description: "Update planner preferences, programs, and defaults.",
    path: "/settings",
    keywords: ["settings", "preferences", "theme", "program"],
  },
  {
    label: "Suggestions & Help",
    description: "Report problems, ask for features, and contact the team.",
    path: "/suggestions",
    keywords: ["help", "support", "contact", "feedback", "suggestion", "bug"],
  },
];

interface AuthUserSummary {
  email: string;
  displayName: string;
}

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const supabase = getSupabaseClient();
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [query, setQuery] = useState("");
  const [siteMatches, setSiteMatches] = useState<SiteSearchTarget[]>([]);
  const [courseMatches, setCourseMatches] = useState<CourseSearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [helpPrompt, setHelpPrompt] = useState("");

  useEffect(() => {
    let active = true;

    const toSummary = (rawUser: any): AuthUserSummary => ({
      email: rawUser.email ?? "",
      displayName:
        rawUser.user_metadata?.full_name
        ?? rawUser.user_metadata?.name
        ?? rawUser.email
        ?? "OrbitUMD User",
    });

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(data.session?.user ? toSummary(data.session.user) : null);
    };

    void load();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toSummary(session.user) : null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const userLabel = useMemo(() => {
    if (!user) {
      return {
        name: "Not signed in",
        email: "",
      };
    }

    return {
      name: user.displayName,
      email: user.email,
    };
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/sign-in", { replace: true });
  };

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setSiteMatches([]);
      setCourseMatches([]);
      setSearchLoading(false);
      return;
    }

    const routeHits = SEARCH_TARGETS
      .filter((target) => {
        const labelHit = target.label.toLowerCase().includes(normalized);
        const descHit = target.description.toLowerCase().includes(normalized);
        const keyHit = target.keywords.some((value) => value.includes(normalized));
        return labelHit || descHit || keyHit;
      })
      .slice(0, 6);

    setSiteMatches(routeHits);

    let active = true;
    if (normalized.length < 3) {
      setCourseMatches([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timeout = window.setTimeout(() => {
      void plannerApi.searchCoursesAcrossRecentTerms(normalized)
        .then((rows) => {
          if (!active) return;
          const next = rows.slice(0, 8).map((row) => ({
            id: row.id,
            title: `${row.id}: ${row.title}`,
            credits: row.credits,
          }));
          setCourseMatches(next);
        })
        .catch(() => {
          if (!active) return;
          setCourseMatches([]);
        })
        .finally(() => {
          if (active) {
            setSearchLoading(false);
          }
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const openHelpDialogFor = (value: string) => {
    setHelpPrompt(value.trim());
    setShowHelpDialog(true);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = query.trim();
    if (!normalized) {
      setSearchOpen(false);
      return;
    }

    const lower = normalized.toLowerCase();
    const courseCodeMatch = normalized.toUpperCase().match(/^[A-Z]{4}\d{3}$/);

    if (lower.includes("help")) {
      openHelpDialogFor(normalized);
      return;
    }

    if (courseCodeMatch) {
      navigate(`/schedule-builder?query=${encodeURIComponent(courseCodeMatch[0])}`);
      setSearchOpen(false);
      return;
    }

    if (siteMatches.length > 0) {
      navigate(siteMatches[0].path);
      setSearchOpen(false);
      return;
    }

    if (courseMatches.length > 0) {
      navigate(`/schedule-builder?query=${encodeURIComponent(courseMatches[0].id)}`);
      setSearchOpen(false);
      return;
    }

    openHelpDialogFor(normalized);
  };

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-5 gap-4">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <form
          onSubmit={handleSearchSubmit}
          className="relative flex-1 max-w-2xl"
          onFocus={() => setSearchOpen(true)}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search courses, requirements..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-10 bg-input-background border-border"
          />
          {searchOpen && query.trim() && (
            <div className="absolute left-0 right-0 top-11 z-40 rounded-md border border-border bg-popover shadow-md">
              <div className="max-h-96 overflow-y-auto p-2 space-y-2">
                {siteMatches.length > 0 && (
                  <div>
                    <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">In OrbitUMD</p>
                    <div className="space-y-1">
                      {siteMatches.map((match) => (
                        <button
                          key={match.path}
                          type="button"
                          className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            navigate(match.path);
                            setSearchOpen(false);
                          }}
                        >
                          <p className="font-medium text-foreground">{match.label}</p>
                          <p className="text-xs text-muted-foreground">{match.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {courseMatches.length > 0 && (
                  <div>
                    <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Courses (Testudo + Catalog)</p>
                    <div className="space-y-1">
                      {courseMatches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            navigate(`/schedule-builder?query=${encodeURIComponent(match.id)}`);
                            setSearchOpen(false);
                          }}
                        >
                          <p className="font-medium text-foreground">{match.title}</p>
                          <p className="text-xs text-muted-foreground">{match.credits} credits</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!searchLoading && siteMatches.length === 0 && courseMatches.length === 0 && (
                  <div className="space-y-2 p-2">
                    <p className="text-sm text-muted-foreground">No quick match yet.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openHelpDialogFor(query)}
                    >
                      <CircleHelp className="w-4 h-4 mr-2" />
                      Open Help & Suggestions
                    </Button>
                  </div>
                )}

                {searchLoading && (
                  <p className="px-2 py-2 text-sm text-muted-foreground">Searching courses and pages...</p>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate("/suggestions")}
          title="Suggestions and help"
        >
          <Lightbulb className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate("/profile")}
          title="Profile"
        >
          <User className="w-5 h-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover border-border">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm">{userLabel.name}</span>
                <span className="text-xs text-muted-foreground">{userLabel.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 w-4 h-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/suggestions")}>Contact / Leave Suggestions</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              <LogOut className="mr-2 w-4 h-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Need help finding that?</DialogTitle>
            <DialogDescription>
              {helpPrompt
                ? `I couldn't find a quick answer for "${helpPrompt}" on ${location.pathname}.`
                : "I couldn't find a quick answer yet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Try these places next:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Search by course code in Schedule Builder, for example CMSC131.</li>
              <li>Open Degree Audit for requirement-level details and progress status.</li>
              <li>Use Suggestions & Help to report issues or request a feature.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHelpDialog(false)}>Close</Button>
            <Button onClick={() => {
              setShowHelpDialog(false);
              navigate("/suggestions");
            }}>
              Open Suggestions & Help
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {searchOpen && (
        <button
          type="button"
          aria-label="Close search suggestions"
          className="fixed inset-0 z-30 cursor-default bg-transparent"
          onClick={() => setSearchOpen(false)}
        />
      )}
    </header>
  );
}