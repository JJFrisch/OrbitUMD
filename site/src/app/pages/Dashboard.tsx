import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowRight, Calendar, Check, CheckCircle2, Circle, Clock, Minus } from "lucide-react";
import { plannerApi } from "@/lib/api/planner";
import { evaluateRequirementSection, loadProgramRequirementBundles, type AuditCourseStatus } from "@/lib/requirements/audit";
import { listUserDegreePrograms } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { ingestNotificationEvent } from "@/lib/notifications/notificationEventService";
import { getAcademicProgressStatus, getCurrentAcademicTerm } from "@/lib/scheduling/termProgress";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo/demoMode";
import "./dashboard-template.css";

interface CourseSnapshot {
  code: string;
  title: string;
  credits: number;
  status: AuditCourseStatus;
  genEds: string[];
}

interface TermSummary {
  label: string;
  code: string;
  year: number;
  status: AuditCourseStatus;
  courseCount: number;
  credits: number;
}

interface RequirementItem {
  name: string;
  detail: string;
  status: AuditCourseStatus;
  completed: number;
  total: number;
}

const TERM_NAME: Record<string, string> = {
  "01": "Spring",
  "05": "Summer",
  "08": "Fall",
  "12": "Winter",
};

const GEN_ED_CATEGORY_BY_CODE: Record<string, "Fundamental Studies" | "Distributive Studies" | "I-Series" | "Diversity"> = {
  FSAR: "Fundamental Studies",
  FSAW: "Fundamental Studies",
  FSMA: "Fundamental Studies",
  FSOC: "Fundamental Studies",
  FSPW: "Fundamental Studies",
  DSHS: "Distributive Studies",
  DSHU: "Distributive Studies",
  DSNL: "Distributive Studies",
  DSNS: "Distributive Studies",
  DSSP: "Distributive Studies",
  SCIS: "I-Series",
  "I-SERIES": "I-Series",
  DVUP: "Diversity",
  DVCC: "Diversity",
};

const GEN_ED_REQUIRED: Record<string, number> = {
  FSAR: 1,
  FSAW: 1,
  FSMA: 1,
  FSOC: 1,
  FSPW: 1,
  DSHS: 2,
  DSHU: 2,
  DSNL: 1,
  DSNS: 1,
  DSSP: 2,
  SCIS: 1,
  "I-SERIES": 2,
  DVUP: 2,
  DVCC: 1,
};

function parseSelections(stored: unknown): Array<any> {
  const payload = (stored ?? []) as { selections?: any[] } | any[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function statusRank(status: AuditCourseStatus): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  if (status === "planned") return 1;
  return 0;
}

function formatTermLabel(termCode: string, termYear: number): string {
  return `${TERM_NAME[termCode] ?? "Term"} ${termYear}`;
}

function getPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

function statusLabel(status: AuditCourseStatus): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In Progress";
  if (status === "planned") return "Planned";
  return "Not Started";
}

function statusClass(status: AuditCourseStatus): string {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in-progress";
  if (status === "planned") return "planned";
  return "not-started";
}

function toneVisual(tone: "amber" | "blue" | "green"): { iconWrap: "gold" | "blue" | "green"; urgency: "med" | "low" | "high" } {
  if (tone === "amber") return { iconWrap: "gold", urgency: "med" };
  if (tone === "blue") return { iconWrap: "blue", urgency: "low" };
  return { iconWrap: "green", urgency: "high" };
}

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const ringRef = useRef<SVGCircleElement>(null);
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    ring.style.strokeDasharray = String(circ);
    ring.style.strokeDashoffset = String(circ);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const offset = circ * (1 - percent / 100);
        ring.style.strokeDashoffset = String(offset);
      });
    });

    let current = 0;
    const target = percent;
    const step = target / (1400 / 16);
    function tick() {
      current = Math.min(current + step, target);
      setDisplayPct(Math.round(current));
      if (current < target) requestAnimationFrame(tick);
    }
    setTimeout(tick, 100);
  }, [percent, circ]);

  return (
    <div className="ring-wrap">
      <svg className="ring-svg" width="110" height="110" viewBox="0 0 110 110">
        <circle className="ring-track" cx="55" cy="55" r={r} />
        <circle ref={ringRef} className="ring-fill" cx="55" cy="55" r={r} />
      </svg>
      <div className="ring-label">
        <div className="ring-pct">{displayPct}%</div>
        <div className="ring-sub">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Student");
  const [terms, setTerms] = useState<TermSummary[]>([]);
  const [completedTermsMissingGrades, setCompletedTermsMissingGrades] = useState<string[]>([]);
  const [courses, setCourses] = useState<CourseSnapshot[]>([]);
  const [programSummary, setProgramSummary] = useState<Array<{ name: string; status: AuditCourseStatus; percent: number }>>([]);
  const [requirementItems, setRequirementItems] = useState<RequirementItem[]>([]);
  const [currentCourses, setCurrentCourses] = useState<Array<{ code: string; title: string; credits: number }>>([]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const demo = isDemoMode();
        const supabase = getSupabaseClient();
        const [authResult, schedules, programs, priorCredits] = await Promise.all([
          demo ? Promise.resolve({ data: { user: null } }) : supabase.auth.getUser(),
          plannerApi.listAllSchedulesWithSelections(),
          listUserDegreePrograms(),
          listUserPriorCredits(),
        ]);
        const authUser = authResult.data;

        let profileName: string;
        if (demo) {
          const { DEMO_PROFILE } = await import("@/lib/demo/demoData");
          profileName = DEMO_PROFILE.display_name;
        } else {
          const { data: profileRow } = authUser.user
            ? await supabase
              .from("user_profiles")
              .select("display_name")
              .eq("id", authUser.user.id)
              .maybeSingle()
            : { data: null as { display_name?: string } | null };

          profileName =
            String(profileRow?.display_name ?? "").trim()
            || (authUser.user?.user_metadata?.full_name as string | undefined)
            || (authUser.user?.user_metadata?.name as string | undefined)
            || authUser.user?.email
            || "Student";
        }

        const mainSchedules = schedules.filter((schedule) => schedule.is_primary && schedule.term_code && schedule.term_year);
        const missingGradeTerms = mainSchedules
          .filter((schedule) => getAcademicProgressStatus({ termCode: schedule.term_code!, termYear: schedule.term_year! }) === "completed")
          .filter((schedule) => {
            const selected = parseSelections(schedule.selections_json);
            if (selected.length === 0) return false;

            const seenCodes = new Set<string>();
            for (const row of selected) {
              const code = String(row?.course?.courseCode ?? "").toUpperCase();
              if (!code || seenCodes.has(code)) continue;
              seenCodes.add(code);

              const grade = String(row?.grade ?? "").trim();
              if (!grade) {
                return true;
              }
            }
            return false;
          })
          .map((schedule) => formatTermLabel(schedule.term_code!, schedule.term_year!));

        const termRows: TermSummary[] = [];
        const byCourse = new Map<string, CourseSnapshot>();
        const currentTermCourses: Array<{ code: string; title: string; credits: number }> = [];
        const now = getCurrentAcademicTerm();

        for (const schedule of mainSchedules) {
          const status = getAcademicProgressStatus({ termCode: schedule.term_code!, termYear: schedule.term_year! });
          const selected = parseSelections(schedule.selections_json);
          const uniqueCodes = new Set<string>();
          let credits = 0;
          const isCurrentTerm = schedule.term_code === now.termCode && schedule.term_year === now.termYear;

          for (const row of selected) {
            const code = String(row?.course?.courseCode ?? "").toUpperCase();
            if (!code || uniqueCodes.has(code)) continue;
            uniqueCodes.add(code);

            const title = String(row?.course?.title ?? row?.course?.courseTitle ?? code);
            const courseCredits = Number(row?.course?.maxCredits ?? row?.course?.credits ?? 0) || 0;

            const nextCourse: CourseSnapshot = {
              code,
              title,
              credits: courseCredits,
              status,
              genEds: Array.isArray(row?.course?.genEds) ? row.course.genEds.map(String) : [],
            };
            credits += nextCourse.credits;

            if (isCurrentTerm || status === "in_progress") {
              currentTermCourses.push({ code, title, credits: courseCredits });
            }

            const existing = byCourse.get(code);
            if (!existing || statusRank(nextCourse.status) > statusRank(existing.status)) {
              byCourse.set(code, nextCourse);
            }
          }

          termRows.push({
            label: formatTermLabel(schedule.term_code!, schedule.term_year!),
            code: schedule.term_code!,
            year: schedule.term_year!,
            status,
            courseCount: uniqueCodes.size,
            credits,
          });
        }

        for (const credit of priorCredits) {
          const creditCodes = String(credit.umdCourseCode ?? "")
            .split(/[|,]/)
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);

          if (creditCodes.length === 0) {
            creditCodes.push(`NO UMD CREDIT ${String(credit.id).slice(0, 8).toUpperCase()}`);
          }

          for (const code of creditCodes) {
            const existing = byCourse.get(code);
            const nextCourse: CourseSnapshot = {
              code,
              title: code,
              credits: Number(credit.credits ?? 0) || 0,
              status: "completed",
              genEds: Array.isArray(credit.genEdCodes) ? credit.genEdCodes.map(String) : [],
            };

            if (!existing || statusRank(nextCourse.status) > statusRank(existing.status)) {
              byCourse.set(code, nextCourse);
            } else {
              byCourse.set(code, {
                ...existing,
                credits: Math.max(existing.credits, nextCourse.credits),
                genEds: Array.from(new Set([...(existing.genEds ?? []), ...(nextCourse.genEds ?? [])])),
              });
            }
          }
        }

        termRows.sort((a, b) => (a.year * 10 + Number(a.code)) - (b.year * 10 + Number(b.code)));

        const bundles = await loadProgramRequirementBundles(programs);
        const byCourseStatus = new Map<string, AuditCourseStatus>();
        for (const course of byCourse.values()) {
          byCourseStatus.set(course.code, course.status);
        }

        const summaries = bundles.map((bundle) => {
          const rows = bundle.sections.map((section) => evaluateRequirementSection(section, byCourseStatus));
          const required = rows.reduce((sum, row) => sum + row.requiredSlots, 0);
          const activeSlots = rows.reduce((sum, row) => sum + row.completedSlots + row.inProgressSlots, 0);

          let status: AuditCourseStatus = "not_started";
          if (required > 0 && rows.every((row) => row.status === "completed")) status = "completed";
          else if (activeSlots > 0) status = "in_progress";
          else if (rows.some((row) => row.status === "planned")) status = "planned";

          return {
            name: bundle.programName,
            status,
            percent: required === 0 ? 0 : Math.min(100, Math.round((activeSlots / required) * 100)),
          };
        });

        // Build section-level requirement items
        const reqItems: RequirementItem[] = [];
        for (const bundle of bundles) {
          for (const section of bundle.sections) {
            const audit = evaluateRequirementSection(section, byCourseStatus);
            if (audit.requiredSlots === 0) continue;
            const completedCount = audit.completedSlots + audit.inProgressSlots;
            const remaining = audit.requiredSlots - completedCount;
            let detail = "";
            if (audit.status === "completed") {
              detail = `All ${audit.requiredSlots} requirement${audit.requiredSlots > 1 ? "s" : ""} satisfied`;
            } else if (remaining > 0) {
              detail = `${remaining} of ${audit.requiredSlots} remaining`;
            }
            reqItems.push({
              name: section.title,
              detail,
              status: audit.status,
              completed: completedCount,
              total: audit.requiredSlots,
            });
          }
        }

        if (!active) return;
        setDisplayName(profileName);
        setTerms(termRows);
        setCompletedTermsMissingGrades(missingGradeTerms);
        setCourses(Array.from(byCourse.values()));
        setProgramSummary(summaries);
        setRequirementItems(reqItems);
        setCurrentCourses(currentTermCourses);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const currentTerm = useMemo(() => {
    const inProgress = terms.find((term) => term.status === "in_progress");
    if (inProgress) return inProgress;

    const now = getCurrentAcademicTerm();
    const future = terms.find((term) => term.year > now.termYear || (term.year === now.termYear && term.code >= now.termCode));
    if (future) return future;

    return terms[terms.length - 1] ?? null;
  }, [terms]);

  const creditTotals = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let planned = 0;

    for (const course of courses) {
      if (course.status === "completed") completed += course.credits;
      else if (course.status === "in_progress") inProgress += course.credits;
      else if (course.status === "planned") planned += course.credits;
    }

    const totalNeeded = 120;
    const remaining = Math.max(0, totalNeeded - completed - inProgress);
    const percent = getPercent(completed + inProgress, totalNeeded);

    return { completed, inProgress, planned, remaining, totalNeeded, percent };
  }, [courses]);

  const courseStatusCounts = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let planned = 0;

    for (const course of courses) {
      if (course.status === "completed") completed += 1;
      else if (course.status === "in_progress") inProgress += 1;
      else if (course.status === "planned") planned += 1;
    }

    return { completed, inProgress, planned };
  }, [courses]);

  const genEdCategoryProgress = useMemo(() => {
    const byTag = new Map<string, AuditCourseStatus>();

    for (const course of courses) {
      for (const tag of course.genEds) {
        const prev = byTag.get(tag);
        if (!prev || statusRank(course.status) > statusRank(prev)) {
          byTag.set(tag, course.status);
        }
      }
    }

    const categories = {
      fundamental: { total: 0, completed: 0 },
      distributive: { total: 0, completed: 0 },
      iSeries: { total: 0, completed: 0 },
      diversity: { total: 0, completed: 0 },
    };

    for (const [tag, required] of Object.entries(GEN_ED_REQUIRED)) {
      const status = byTag.get(tag) ?? "not_started";
      const completed = status === "completed" ? Math.min(required, 1) : 0;
      const category = GEN_ED_CATEGORY_BY_CODE[tag];
      if (category === "Fundamental Studies") {
        categories.fundamental.total += required;
        categories.fundamental.completed += completed;
      } else if (category === "Distributive Studies") {
        categories.distributive.total += required;
        categories.distributive.completed += completed;
      } else if (category === "I-Series") {
        categories.iSeries.total += required;
        categories.iSeries.completed += completed;
      } else if (category === "Diversity") {
        categories.diversity.total += required;
        categories.diversity.completed += completed;
      }
    }

    return categories;
  }, [courses]);

  const semestersLeft = useMemo(() => {
    return terms.filter((t) => t.status === "planned" || t.status === "not_started").length;
  }, [terms]);

  const suggestions = useMemo(() => {
    const items: Array<{ id: string; title: string; subtitle: string; href: string; tone: "amber" | "blue" | "green" }> = [];

    if (terms.length === 0) {
      items.push({
        id: "schedules",
        title: "Set up your first MAIN schedule",
        subtitle: "Your dashboard cards will populate from MAIN schedules as soon as one exists.",
        href: "/schedules",
        tone: "amber",
      });
    }

    if (programSummary.length === 0) {
      items.push({
        id: "programs",
        title: "Declare your major/minor programs",
        subtitle: "Program-aware auditing and requirement insights need at least one selected program.",
        href: "/settings",
        tone: "blue",
      });
    }

    if (completedTermsMissingGrades.length > 0) {
      const firstTerm = completedTermsMissingGrades[0];
      items.push({
        id: "missing-grades",
        title: `Add missing grades for ${firstTerm}`,
        subtitle: "Adding grades for ended semesters improves your progress and planning quality.",
        href: "/four-year-plan",
        tone: "amber",
      });
    }

    const incompletePrograms = programSummary.filter((program) => program.status !== "completed");
    if (incompletePrograms.length > 0) {
      items.push({
        id: "audit",
        title: `Review ${incompletePrograms[0].name} audit status`,
        subtitle: "See unmet sections and what courses can satisfy them next.",
        href: "/degree-audit",
        tone: "green",
      });
    }

    if (items.length === 0) {
      items.push({
        id: "plan",
        title: "Keep your four-year plan fresh",
        subtitle: "You are on track. Review future terms and rebalance credits if needed.",
        href: "/four-year-plan",
        tone: "green",
      });
    }

    return items.slice(0, 4);
  }, [completedTermsMissingGrades, programSummary, terms.length]);

  const primarySuggestion = suggestions[0];

  const reqCheckIcon = (status: AuditCourseStatus) => {
    if (status === "completed") return <Check className="h-3 w-3" />;
    if (status === "in_progress") return <Minus className="h-3 w-3" />;
    return <Circle className="h-3 w-3" />;
  };

  const reqCheckClass = (status: AuditCourseStatus) => {
    if (status === "completed") return "done";
    if (status === "in_progress" || status === "planned") return "warn";
    return "open";
  };

  const reqTagLabel = (item: RequirementItem) => {
    if (item.status === "completed") return "Complete";
    if (item.status === "in_progress") return "In Progress";
    if (item.status === "planned") return "Planned";
    return "Not started";
  };

  const semDotClass = (status: AuditCourseStatus) => {
    if (status === "completed") return "done";
    if (status === "in_progress") return "current-dot";
    return "future";
  };

  const semBarClass = (status: AuditCourseStatus) => {
    if (status === "completed") return "done";
    if (status === "in_progress") return "cur";
    return "fut";
  };

  const semStatusLabel = (status: AuditCourseStatus) => {
    if (status === "completed") return "Done";
    if (status === "in_progress") return "In Progress";
    if (status === "planned") return "Planned";
    return "Future";
  };

  useEffect(() => {
    if (loading || errorMessage || completedTermsMissingGrades.length === 0) return;

    const termSummary = completedTermsMissingGrades.join(" | ");
    void ingestNotificationEvent({
      type: "graduation_gaps",
      title: "Completed terms are missing final grades",
      message: `Update final grades for: ${termSummary}`,
      dedupeScope: "dashboard-missing-grades",
      metadata: {
        terms: completedTermsMissingGrades,
      },
    });
  }, [completedTermsMissingGrades, errorMessage, loading]);

  return (
    <div className="dashboard-template">
      <div className="topbar">
        <div className="topbar-left">
          <h2>Welcome back, {displayName}!</h2>
          <p>Live overview from your saved schedules and selected programs</p>
        </div>
        <div className="topbar-actions">
          <Link to="/schedules" className="topbar-btn">
            View Schedules
          </Link>
          <Link to="/degree-audit" className="topbar-btn primary">
            View Degree Audit
          </Link>
        </div>
      </div>

      <div className="content">
        {!loading && completedTermsMissingGrades.length > 0 && (
          <Link to="/four-year-plan" className="deadline-banner">
            <span className="deadline-icon">📅</span>
            <div className="deadline-text">
              <strong>Some completed terms still need final grades</strong>
              <span>
                Add grades for {completedTermsMissingGrades[0]} to keep your dashboard progress metrics accurate.
              </span>
            </div>
          </Link>
        )}

        {!loading && primarySuggestion && (
          <Link to={primarySuggestion.href} className="action-prompt">
            <div className="prompt-icon">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="prompt-text">
              <strong>{primarySuggestion.title}</strong>
              <span>{primarySuggestion.subtitle}</span>
            </div>
            <ArrowRight className="h-4 w-4" color="rgba(255,255,255,0.45)" />
          </Link>
        )}

        {loading && (
          <div className="card">
            <p className="loading-state">Loading dashboard...</p>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="card">
            <p className="error-state">{errorMessage}</p>
          </div>
        )}

        {!loading && !errorMessage && (
          <>
            {/* Row 1: Degree Progress Ring + Semester Timeline */}
            <div className="grid-2">
              <section className="card" data-tour-target="dashboard-term-overview">
                <div className="card-header">
                  <div>
                    <div className="card-title">Degree Progress</div>
                    <div className="card-subtitle">
                      {programSummary.length > 0 ? programSummary[0].name : "Overall credit progress"}
                    </div>
                  </div>
                  <Link to="/degree-audit" className="card-link">Full view →</Link>
                </div>

                <div className="progress-hero">
                  <ProgressRing percent={creditTotals.percent} label="complete" />
                  <div className="ring-details">
                    <p>
                      {creditTotals.percent >= 100
                        ? "You have met the credit requirement!"
                        : creditTotals.remaining <= 30
                          ? `Almost there — ${creditTotals.remaining} credits to go.`
                          : `Keep going — ${creditTotals.remaining} credits remaining.`}
                    </p>
                    <div className="ring-meta">
                      <div className="ring-meta-item">
                        <div className="ring-meta-dot" style={{ background: "var(--red)" }} />
                        <span className="ring-meta-label">Credits earned</span>
                        <span className="ring-meta-val">{creditTotals.completed} / {creditTotals.totalNeeded}</span>
                      </div>
                      <div className="ring-meta-item">
                        <div className="ring-meta-dot" style={{ background: "var(--gold)" }} />
                        <span className="ring-meta-label">In progress</span>
                        <span className="ring-meta-val">{creditTotals.inProgress} credits</span>
                      </div>
                      <div className="ring-meta-item">
                        <div className="ring-meta-dot" style={{ background: "#EDE7E1" }} />
                        <span className="ring-meta-label">Remaining</span>
                        <span className="ring-meta-val">{creditTotals.remaining} credits</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Semester Timeline</div>
                    <div className="card-subtitle">Credits per term</div>
                  </div>
                  <Link to="/four-year-plan" className="card-link">Edit plan →</Link>
                </div>

                {terms.length === 0 ? (
                  <p className="empty-note">No MAIN schedules found. Create one to see your timeline.</p>
                ) : (
                  <div className="semester-track">
                    {terms.map((term) => {
                      const barWidth = term.status === "completed" ? 100
                        : term.status === "in_progress" ? 60
                        : 100;
                      return (
                        <div key={`${term.code}-${term.year}`} className={`sem-row${term.status === "in_progress" ? " current" : ""}`}>
                          <div className={`sem-dot ${semDotClass(term.status)}`} />
                          <div className="sem-name">{term.label}</div>
                          <div className="sem-bar-wrap">
                            <SemBar className={semBarClass(term.status)} width={barWidth} />
                          </div>
                          <div className="sem-credits">{term.credits > 0 ? `${term.credits} cr` : "—"}</div>
                          <div className={`sem-status ${semBarClass(term.status)}`}>{semStatusLabel(term.status)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Row 2: Requirements Checklist + Action Items */}
            <div className="grid-2">
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Requirements Checklist</div>
                    <div className="card-subtitle">Major · Gen Ed · University</div>
                  </div>
                  <Link to="/degree-audit" className="card-link">All reqs →</Link>
                </div>

                {requirementItems.length === 0 ? (
                  <p className="empty-note">No declared major/minor yet. Add programs in Settings to activate auditing.</p>
                ) : (
                  <div className="req-list">
                    {requirementItems.slice(0, 6).map((item, i) => (
                      <Link to="/degree-audit" key={i} className="req-item">
                        <div className={`req-check ${reqCheckClass(item.status)}`}>
                          {reqCheckIcon(item.status)}
                        </div>
                        <div className="req-text">
                          <div className="req-name">{item.name}</div>
                          <div className="req-detail">{item.detail}</div>
                        </div>
                        <div className={`req-tag ${reqCheckClass(item.status)}`}>{reqTagLabel(item)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section className="card" data-tour-target="dashboard-next-actions">
                <div className="card-header">
                  <div>
                    <div className="card-title">Action Items</div>
                    <div className="card-subtitle">Things that need your attention</div>
                  </div>
                </div>

                <div className="nudge-list">
                  {suggestions.map((suggestion) => {
                    const visual = toneVisual(suggestion.tone);
                    return (
                      <Link key={suggestion.id} to={suggestion.href} className="nudge">
                        <div className={`nudge-icon-wrap ${visual.iconWrap}`}>
                          {suggestion.tone === "amber" ? (
                            <Clock className="h-4 w-4" />
                          ) : suggestion.tone === "blue" ? (
                            <Calendar className="h-4 w-4" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                        </div>
                        <div className="nudge-body">
                          <div className="nudge-title">{suggestion.title}</div>
                          <div className="nudge-desc">{suggestion.subtitle}</div>
                        </div>
                        <span className={`nudge-urgency ${visual.urgency}`}></span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Row 3: Current Courses + Stats */}
            <div className="grid-2">
              <section className="card">
                <div className="section-heading">
                  Current Semester Courses
                  <Link to="/four-year-plan">Edit this term →</Link>
                </div>

                {currentCourses.length === 0 ? (
                  <p className="empty-note">No courses found for the current term.</p>
                ) : (
                  <div className="course-grid">
                    {currentCourses.map((course) => (
                      <div key={course.code} className="course-slot">
                        <div className="course-code">{course.code}</div>
                        <div className="course-name">{course.title}</div>
                        <div className="course-meta">{course.credits} cr</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <section className="card" data-tour-target="dashboard-program-progress">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Program Progress</div>
                      <div className="card-subtitle">Requirement fulfillment by declared program</div>
                    </div>
                    <Link to="/degree-audit" className="card-link">Full view →</Link>
                  </div>

                  {programSummary.length === 0 ? (
                    <p className="empty-note">No declared major/minor yet. Add programs in Settings to activate auditing.</p>
                  ) : (
                    <div className="metric-list">
                      {programSummary.slice(0, 4).map((program) => (
                        <div key={program.name} className="metric-row">
                          <div className="metric-top">
                            <span className="metric-name">{program.name}</span>
                            <span className="metric-value">{program.percent}%</span>
                          </div>
                          <div className="metric-bar-wrap">
                            <div className="metric-bar" style={{ width: `${program.percent}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="stat-trio">
                  <div className="stat-cell">
                    <div className="stat-num red">{creditTotals.completed}</div>
                    <div className="stat-label">Credits Earned</div>
                  </div>
                  <div className="stat-cell">
                    <div className="stat-num">{courseStatusCounts.inProgress}</div>
                    <div className="stat-label">Courses Now</div>
                  </div>
                  <div className="stat-cell">
                    <div className="stat-num gold">{semestersLeft}</div>
                    <div className="stat-label">Semesters Left</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: Gen Ed Progress */}
            <div className="grid-2">
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">General Education Progress</div>
                    <div className="card-subtitle">Computed from schedule selections and prior credits</div>
                  </div>
                  <Link to="/gen-eds" className="card-link">Details →</Link>
                </div>

                <div className="metric-list">
                  <div className="metric-row">
                    <div className="metric-top">
                      <span className="metric-name">Fundamental Studies</span>
                      <span className="metric-value">
                        {genEdCategoryProgress.fundamental.completed}/{genEdCategoryProgress.fundamental.total}
                      </span>
                    </div>
                    <div className="metric-bar-wrap">
                      <div className="metric-bar" style={{ width: `${getPercent(genEdCategoryProgress.fundamental.completed, genEdCategoryProgress.fundamental.total)}%` }}></div>
                    </div>
                  </div>

                  <div className="metric-row">
                    <div className="metric-top">
                      <span className="metric-name">Distributive Studies</span>
                      <span className="metric-value">
                        {genEdCategoryProgress.distributive.completed}/{genEdCategoryProgress.distributive.total}
                      </span>
                    </div>
                    <div className="metric-bar-wrap">
                      <div className="metric-bar" style={{ width: `${getPercent(genEdCategoryProgress.distributive.completed, genEdCategoryProgress.distributive.total)}%` }}></div>
                    </div>
                  </div>

                  <div className="metric-row">
                    <div className="metric-top">
                      <span className="metric-name">I-Series</span>
                      <span className="metric-value">
                        {genEdCategoryProgress.iSeries.completed}/{genEdCategoryProgress.iSeries.total}
                      </span>
                    </div>
                    <div className="metric-bar-wrap">
                      <div className="metric-bar" style={{ width: `${getPercent(genEdCategoryProgress.iSeries.completed, genEdCategoryProgress.iSeries.total)}%` }}></div>
                    </div>
                  </div>

                  <div className="metric-row">
                    <div className="metric-top">
                      <span className="metric-name">Diversity</span>
                      <span className="metric-value">
                        {genEdCategoryProgress.diversity.completed}/{genEdCategoryProgress.diversity.total}
                      </span>
                    </div>
                    <div className="metric-bar-wrap">
                      <div className="metric-bar" style={{ width: `${getPercent(genEdCategoryProgress.diversity.completed, genEdCategoryProgress.diversity.total)}%` }}></div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SemBar({ className, width }: { className: string; width: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || className === "fut") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = `${width}%`;
      });
    });
  }, [width, className]);

  return (
    <div
      ref={ref}
      className={`sem-bar ${className}`}
      style={className === "fut" ? { width: "100%" } : undefined}
    />
  );
}
