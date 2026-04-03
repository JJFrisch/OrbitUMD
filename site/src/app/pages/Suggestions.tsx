import { useEffect, useMemo, useState } from "react";
import { Bug, Check, ChevronDown, ChevronUp, ExternalLink, Lightbulb, Loader2, Mail, MessageSquare, Send, Settings2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { createUserFeedbackSubmission, listUserFeedbackSubmissions, type FeedbackType, type UserFeedbackSubmission } from "@/lib/repositories/userFeedbackRepository";
import {
  loadStudentPreferences,
  saveStudentPreferences,
  INTEREST_AREA_OPTIONS,
  COURSE_FORMAT_OPTIONS,
  type StudentPreferences,
  type WorkloadTolerance,
} from "@/lib/repositories/studentPreferencesRepository";
import { plannerApi } from "@/lib/api/planner";
import { buildNeededClassItems, type NeededClassItem } from "@/lib/requirements/neededClassesAdvisor";
import { loadProgramRequirementBundles, type AuditCourseStatus } from "@/lib/requirements/audit";
import { listUserDegreePrograms } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { lookupCourseDetails } from "@/lib/requirements/courseDetailsLoader";
import { resolvePriorCreditCourseCodes } from "@/lib/requirements/priorCreditLabels";
import { getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import "./suggestions-template.css";

type SuggestionsTab = "courses" | "feedback";
type CourseFilter = "all" | "major_minor" | "gened" | "elective";

const FILTER_LABELS: Record<CourseFilter, string> = {
  all: "All recommendations",
  major_minor: "Major / Minor",
  gened: "Gen Ed gaps",
  elective: "Electives",
};

const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { value: "feature", label: "Feature", icon: Lightbulb },
  { value: "bug", label: "Bug", icon: Bug },
  { value: "other", label: "Contact", icon: Mail },
];

const WORKLOAD_OPTIONS: Array<{ value: WorkloadTolerance; label: string; desc: string }> = [
  { value: "light", label: "Light", desc: "Prefer easier course load" },
  { value: "moderate", label: "Moderate", desc: "Balanced workload" },
  { value: "heavy", label: "Heavy", desc: "Comfortable with heavy load" },
];

function feedbackStatusMeta(status: UserFeedbackSubmission["status"]): {
  dotClass: "open" | "review" | "done";
  badgeClass: "open" | "review" | "done";
  label: string;
} {
  if (status === "new") return { dotClass: "open", badgeClass: "open", label: "Open" };
  if (status === "reviewing") return { dotClass: "review", badgeClass: "review", label: "In Review" };
  if (status === "resolved") return { dotClass: "done", badgeClass: "done", label: "Shipped" };
  return { dotClass: "done", badgeClass: "done", label: "Closed" };
}

function categoryTag(item: NeededClassItem) {
  if (item.category === "gened") return { label: "Gen Ed", cls: "ge" };
  if (item.category === "elective") return { label: "Elective", cls: "easy" };
  const label = item.programLabel ?? "";
  if (label.startsWith("MAJOR:")) return { label: "Major", cls: "major" };
  if (label.startsWith("MINOR:")) return { label: "Minor", cls: "minor" };
  return { label: "Requirement", cls: "major" };
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(110, score));
  const pct = Math.round((clamped / 110) * 100);
  const color = clamped >= 85 ? "#2e7d32" : clamped >= 60 ? "#e6a700" : "#c62828";
  return (
    <div className="ou-score-bar" title={`Score: ${Math.round(clamped)} / 110`}>
      <div className="ou-score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="ou-score-bar-label">{Math.round(clamped)}</span>
    </div>
  );
}

function SuggestionCard({
  item,
  index,
  isAdded,
  onAdd,
  onDetails,
}: {
  item: NeededClassItem;
  index: number;
  isAdded: boolean;
  onAdd: (item: NeededClassItem) => void;
  onDetails: (item: NeededClassItem) => void;
}) {
  const tag = categoryTag(item);
  const displayCode = item.courseCode ?? item.genEdCode ?? "—";
  const why = item.rationale[0] ?? "Recommended based on your program requirements.";
  const subline = [
    item.programLabel,
    item.recommendedTermLabel ? `Suggested: ${item.recommendedTermLabel}` : null,
  ].filter(Boolean).join(" · ");

  const detailsLabel = item.category === "gened" ? "Find courses" : "Details";
  const addLabel = item.category === "elective" ? "Explore" : item.category === "gened" ? "Filter term" : "+ Add to plan";
  const canAdd = item.category !== "elective";

  return (
    <article
      className="ou-course-card"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="ou-course-card-top">
        <div className="ou-course-row-1">
          <span className="ou-course-code">{displayCode}</span>
          <span className="ou-course-credits">{item.credits} cr</span>
        </div>

        <div className="ou-course-name">{item.title}</div>

        <div className="ou-course-tags">
          <span className={`ou-course-tag ${tag.cls}`}>{tag.label}</span>
          {item.status === "planned" && (
            <span className="ou-course-tag" style={{ background: "rgba(100,100,100,0.07)", color: "#555", border: "1px solid rgba(100,100,100,0.18)" }}>
              Already planned
            </span>
          )}
          {item.status === "in_progress" && (
            <span className="ou-course-tag" style={{ background: "rgba(59,130,246,0.08)", color: "#1d4ed8", border: "1px solid rgba(59,130,246,0.2)" }}>
              In progress
            </span>
          )}
        </div>

        <div className="ou-course-why">{why}</div>

        {item.rationale.length > 1 && (
          <div className="ou-course-extra-rationale">
            {item.rationale.slice(1).map((line, idx) => (
              <div key={idx} className="ou-course-rationale-line">{line}</div>
            ))}
          </div>
        )}

        {subline && (
          <div className="ou-course-seats">{subline}</div>
        )}
      </div>

      <div className="ou-course-card-bottom">
        <ScoreBar score={item.recommendationScore} />
        <div className="ou-course-actions">
          <button
            type="button"
            className="ou-course-btn"
            onClick={() => onDetails(item)}
          >
            {detailsLabel}
          </button>
          {canAdd && (
            <button
              type="button"
              className={`ou-course-btn add ${isAdded ? "added" : ""}`}
              onClick={() => onAdd(item)}
              disabled={isAdded}
            >
              {isAdded ? (
                <><Check size={12} /> Added</>
              ) : (
                addLabel
              )}
            </button>
          )}
          {!canAdd && (
            <button
              type="button"
              className="ou-course-btn"
              onClick={() => onDetails(item)}
            >
              Browse
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <article
      className="ou-course-card"
      style={{ animationDelay: `${index * 0.04}s`, animation: "ou-fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
      aria-hidden
    >
      <div className="ou-course-card-top">
        <div className="ou-course-row-1">
          <span className="ou-course-code" style={{ background: "var(--border)", borderRadius: 4, color: "transparent", minWidth: 72 }}>&nbsp;</span>
          <span className="ou-course-credits" style={{ background: "var(--border)", borderRadius: 4, color: "transparent", minWidth: 40 }}>&nbsp;</span>
        </div>
        <div className="ou-course-name" style={{ background: "var(--border)", borderRadius: 4, color: "transparent", height: 16, marginBottom: 8 }}>&nbsp;</div>
        <div className="ou-course-why" style={{ background: "var(--border)", borderRadius: 4, color: "transparent", height: 34 }}>&nbsp;</div>
      </div>
      <div className="ou-course-card-bottom" style={{ minHeight: 38 }} />
    </article>
  );
}

// ── Preferences Panel ──

function PreferencesPanel({
  preferences,
  onSave,
}: {
  preferences: StudentPreferences;
  onSave: (prefs: StudentPreferences) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [interests, setInterests] = useState<string[]>(preferences.interestAreas);
  const [workload, setWorkload] = useState<WorkloadTolerance>(preferences.workloadTolerance);
  const [formats, setFormats] = useState<string[]>(preferences.preferredCourseFormats);
  const [dirty, setDirty] = useState(false);

  const toggleInterest = (area: string) => {
    setInterests((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
    setDirty(true);
  };

  const toggleFormat = (fmt: string) => {
    setFormats((prev) => prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]);
    setDirty(true);
  };

  const handleSave = () => {
    onSave({
      ...preferences,
      interestAreas: interests,
      workloadTolerance: workload,
      preferredCourseFormats: formats,
    });
    setDirty(false);
    toast.success("Preferences saved — recommendations will update.");
  };

  return (
    <div className="ou-prefs-panel">
      <button
        type="button"
        className="ou-prefs-toggle"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Settings2 size={15} />
        <span>Personalization preferences</span>
        {interests.length > 0 && (
          <span className="ou-prefs-badge">{interests.length} interest{interests.length !== 1 ? "s" : ""}</span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="ou-prefs-body">
          <div className="ou-prefs-section">
            <div className="ou-prefs-section-label">Interest areas</div>
            <p className="ou-prefs-section-desc">Select topics you're interested in to improve elective and course recommendations.</p>
            <div className="ou-prefs-chips">
              {INTEREST_AREA_OPTIONS.map((area) => (
                <button
                  key={area}
                  type="button"
                  className={`ou-prefs-chip ${interests.includes(area) ? "active" : ""}`}
                  onClick={() => toggleInterest(area)}
                >
                  {area}
                  {interests.includes(area) && <X size={11} />}
                </button>
              ))}
            </div>
          </div>

          <div className="ou-prefs-section">
            <div className="ou-prefs-section-label">Workload tolerance</div>
            <div className="ou-prefs-workload-row">
              {WORKLOAD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ou-prefs-workload-btn ${workload === opt.value ? "active" : ""}`}
                  onClick={() => { setWorkload(opt.value); setDirty(true); }}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ou-prefs-section">
            <div className="ou-prefs-section-label">Preferred formats</div>
            <div className="ou-prefs-chips">
              {COURSE_FORMAT_OPTIONS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={`ou-prefs-chip ${formats.includes(fmt) ? "active" : ""}`}
                  onClick={() => toggleFormat(fmt)}
                >
                  {fmt}
                  {formats.includes(fmt) && <X size={11} />}
                </button>
              ))}
            </div>
          </div>

          {dirty && (
            <button type="button" className="ou-prefs-save-btn" onClick={handleSave}>
              Save preferences
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function Suggestions() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SuggestionsTab>("courses");
  const [activeFilter, setActiveFilter] = useState<CourseFilter>("all");

  // Live course suggestion state
  const [suggestions, setSuggestions] = useState<NeededClassItem[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [hasPrograms, setHasPrograms] = useState(true);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());

  // Student preferences
  const [preferences, setPreferences] = useState<StudentPreferences | null>(null);
  const [prefsVersion, setPrefsVersion] = useState(0);

  // Feedback form state
  const [type, setType] = useState<FeedbackType>("feature");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<UserFeedbackSubmission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load preferences
  useEffect(() => {
    void loadStudentPreferences().then(setPreferences);
  }, [prefsVersion]);

  const handleSavePreferences = (prefs: StudentPreferences) => {
    setPreferences(prefs);
    void saveStudentPreferences(prefs);
    setPrefsVersion((v) => v + 1);
  };

  // Load live suggestions from the neededClassesAdvisor engine
  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoadingCourses(true);
      try {
        const [programs, priorCredits, schedules] = await Promise.all([
          listUserDegreePrograms(),
          listUserPriorCredits(),
          plannerApi.listAllSchedulesWithSelections(),
        ]);

        if (!active) return;
        setHasPrograms(programs.length > 0);

        const bundles = await loadProgramRequirementBundles(programs);
        if (!active) return;

        const byCourseCode = new Map<string, AuditCourseStatus>();
        const byCourseTags = new Map<string, string[]>();

        for (const schedule of schedules) {
          if (!schedule.is_primary || !schedule.term_code || !schedule.term_year) continue;
          const status = getAcademicProgressStatus({ termCode: schedule.term_code, termYear: schedule.term_year });
          const payload = schedule.selections_json as { selections?: Array<any> } | Array<any>;
          const selectionsList = Array.isArray(payload) ? payload : (Array.isArray((payload as any)?.selections) ? (payload as any).selections : []);

          for (const sel of selectionsList) {
            const code = String(sel?.course?.courseCode ?? "").toUpperCase();
            if (!code) continue;
            const current = byCourseCode.get(code) ?? "not_started";
            const ranks: Record<AuditCourseStatus, number> = { completed: 4, in_progress: 3, planned: 2, not_started: 1 };
            if (ranks[status] > ranks[current]) byCourseCode.set(code, status);
            byCourseTags.set(code, Array.isArray(sel?.course?.genEds) ? sel.course.genEds : []);
          }
        }

        for (const credit of priorCredits) {
          if (credit.countsTowardProgress === false) continue;
          for (const code of resolvePriorCreditCourseCodes(credit)) {
            byCourseCode.set(code, "completed");
            byCourseTags.set(code, Array.isArray(credit.genEdCodes) ? credit.genEdCodes : []);
          }
        }

        const neededCodes = Array.from(
          new Set(bundles.flatMap((b) => b.sections.flatMap((s) => s.courseCodes ?? [])))
        ).map((c) => String(c).toUpperCase()).filter(Boolean);

        const courseDetails = neededCodes.length > 0 ? await lookupCourseDetails(neededCodes) : new Map();
        if (!active) return;

        // Estimate terms until graduation
        const primaryProgram = programs.find((p) => p.isPrimary) ?? programs[0];
        let termsUntilGraduation = 6;
        if (primaryProgram?.expectedGraduationTermId) {
          // Rough estimate based on number of future schedules
          const futureSchedules = schedules.filter(
            (s) => s.is_primary && getAcademicProgressStatus({ termCode: s.term_code!, termYear: s.term_year! }) === "planned",
          ).length;
          termsUntilGraduation = Math.max(1, futureSchedules || 6);
        }

        const items = buildNeededClassItems({
          bundles,
          byCourseCode,
          byCourseTags,
          courseDetails,
          preferences,
          termsUntilGraduation,
        });
        const sorted = [...items]
          .filter((item) => item.status !== "completed")
          .sort((a, b) => b.recommendationScore - a.recommendationScore)
          .slice(0, 30);

        if (active) setSuggestions(sorted);
      } catch {
        // fail silently — empty state handles it
      } finally {
        if (active) setLoadingCourses(false);
      }
    };

    void run();
    return () => { active = false; };
  }, [preferences]);

  // Load feedback history
  useEffect(() => {
    let active = true;
    void listUserFeedbackSubmissions()
      .then((rows) => { if (active) setHistory(rows); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Unable to load feedback history."); })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (activeFilter === "all") return suggestions;
    return suggestions.filter((item) => item.category === activeFilter);
  }, [activeFilter, suggestions]);

  const filterCounts = useMemo(() => {
    const counts: Record<CourseFilter, number> = { all: suggestions.length, major_minor: 0, gened: 0, elective: 0 };
    for (const item of suggestions) {
      if (item.category === "major_minor") counts.major_minor += 1;
      else if (item.category === "gened") counts.gened += 1;
      else if (item.category === "elective") counts.elective += 1;
    }
    return counts;
  }, [suggestions]);

  const handleAdd = (item: NeededClassItem) => {
    const key = item.courseCode ?? item.genEdCode ?? item.id;
    if (item.category === "gened" && item.genEdCode) {
      navigate(`/schedule-builder?gened=${encodeURIComponent(item.genEdCode)}`);
      return;
    }
    if (!item.courseCode) return;
    setAddedCodes((prev) => new Set([...prev, key]));
    toast.success(`Opening ${item.courseCode} in the Schedule Builder…`);
    navigate(`/schedule-builder?search=${encodeURIComponent(item.courseCode)}`);
  };

  const handleDetails = (item: NeededClassItem) => {
    if (item.category === "gened" && item.genEdCode) {
      navigate(`/schedule-builder?gened=${encodeURIComponent(item.genEdCode)}`);
    } else if (item.courseCode) {
      navigate(`/schedule-builder?search=${encodeURIComponent(item.courseCode)}`);
    } else {
      navigate("/schedule-builder");
    }
  };

  const submitSuggestion = async () => {
    const normalizedTitle = title.trim();
    const normalizedDetails = details.trim();
    const normalizedContact = contact.trim();

    if (!normalizedTitle || !normalizedDetails) {
      toast.error("Please include both a title and details.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createUserFeedbackSubmission({
        feedbackType: type,
        title: normalizedTitle,
        details: normalizedDetails,
        contact: normalizedContact || undefined,
        pagePath: location.pathname,
      });
      setHistory((prev) => [created, ...prev].slice(0, 20));
      setTitle("");
      setDetails("");
      setContact("");
      setActiveTab("feedback");
      toast.success("Feedback saved to OrbitUMD.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ou-suggestions-page">
      <div className="ou-suggestions-topbar">
        <h1>Suggestions &amp; <em style={{ color: "#c62828" }}>Help</em></h1>
        <p>Personalized course recommendations from your actual programs and transcripts, plus a direct line to the OrbitUMD team.</p>
      </div>

      <div className="ou-suggestions-tab-nav" role="tablist" aria-label="Suggestions sections">
        <button
          type="button"
          role="tab"
          className={`ou-suggestions-tab-btn ${activeTab === "courses" ? "active" : ""}`}
          onClick={() => setActiveTab("courses")}
        >
          Course Recommendations
        </button>
        <button
          type="button"
          role="tab"
          className={`ou-suggestions-tab-btn ${activeTab === "feedback" ? "active" : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          Report / Request
        </button>
      </div>

      {activeTab === "courses" && (
        <div className="ou-suggestions-content">
          <div className="ou-suggestions-hero">
            <h3>
              {loadingCourses ? "Loading your personalized picks…" : !hasPrograms ? "Declare a major to unlock recommendations" : `${suggestions.length} personalized recommendations`}
            </h3>
            <p>
              {!hasPrograms
                ? "Recommendations are driven by your declared programs. Head to Settings to add a major or minor, then come back here."
                : "Ranked by prerequisite readiness, requirement urgency, plan fit, and your interests — updated live from your transcript and schedules."}
            </p>
            <p style={{ fontSize: "0.7rem", color: "var(--ink-ghost)", marginTop: "8px" }}>
              This feature is not yet live — recommendations are in beta.
            </p>
          </div>

          {preferences && (
            <PreferencesPanel preferences={preferences} onSave={handleSavePreferences} />
          )}

          {!hasPrograms && !loadingCourses && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <Link to="/settings#academic" className="ou-course-btn add" style={{ display: "inline-flex", padding: "10px 24px", fontSize: "0.82rem" }}>
                Go to Settings → Declare Programs
              </Link>
            </div>
          )}

          {(hasPrograms || loadingCourses) && (
            <>
              <div className="ou-suggestions-filters">
                {(Object.keys(FILTER_LABELS) as CourseFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`ou-suggestions-filter ${activeFilter === filter ? "active" : ""}`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {FILTER_LABELS[filter]}
                    {!loadingCourses && filterCounts[filter] > 0 && (
                      <span style={{ marginLeft: 5, opacity: 0.65 }}>({filterCounts[filter]})</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="ou-course-grid">
                {loadingCourses
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} index={i} />)
                  : filteredSuggestions.length > 0
                    ? filteredSuggestions.map((item, index) => (
                        <SuggestionCard
                          key={item.id}
                          item={item}
                          index={index}
                          isAdded={addedCodes.has(item.courseCode ?? item.genEdCode ?? item.id)}
                          onAdd={handleAdd}
                          onDetails={handleDetails}
                        />
                      ))
                    : (
                        <div style={{ gridColumn: "1 / -1", padding: "32px 0", textAlign: "center" }}>
                          <p style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}>
                            {activeFilter === "all"
                              ? "No remaining requirements found — your plan looks complete!"
                              : `No ${FILTER_LABELS[activeFilter].toLowerCase()} recommendations at this time.`}
                          </p>
                        </div>
                      )}
              </div>

              {!loadingCourses && suggestions.length > 0 && (
                <p style={{ fontSize: "0.7rem", color: "var(--ink-ghost)", textAlign: "center" }}>
                  Showing top {filteredSuggestions.length} of {filterCounts[activeFilter === "all" ? "all" : activeFilter]} recommendations · Scored 0–110 across prerequisite readiness, urgency, plan fit, and interest alignment
                </p>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "feedback" && (
        <div className="ou-suggestions-content">
          <div className="ou-feedback-grid">
            <form
              className="ou-feedback-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitSuggestion();
              }}
            >
              <div className="ou-feedback-title">Send Feedback</div>

              <div>
                <div className="ou-field-label">Type</div>
                <div className="ou-type-row">
                  {FEEDBACK_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`ou-type-btn ${type === option.value ? "active" : ""}`}
                        onClick={() => setType(option.value)}
                      >
                        <Icon size={16} />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="ou-field-label" htmlFor="feedback-title">Title</label>
                <input
                  id="feedback-title"
                  className="ou-field-input"
                  type="text"
                  placeholder="Short summary of your feedback"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div>
                <label className="ou-field-label" htmlFor="feedback-details">Details</label>
                <textarea
                  id="feedback-details"
                  className="ou-field-input ou-field-textarea"
                  placeholder="What happened, what you expected, and any helpful context..."
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                />
              </div>

              <div>
                <label className="ou-field-label" htmlFor="feedback-contact">Contact (optional)</label>
                <input
                  id="feedback-contact"
                  className="ou-field-input"
                  type="text"
                  placeholder="Email or Discord handle for follow-up"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                />
              </div>

              <button type="submit" className="ou-submit-btn" disabled={submitting}>
                {submitting ? <Loader2 size={14} className="ou-spin" /> : <Send size={14} />}
                {submitting ? "Submitting..." : "Submit feedback"}
              </button>
            </form>

            <div className="ou-feedback-sidebar">
              <section className="ou-feedback-sidebar-card">
                <div className="ou-feedback-sidebar-header">Your recent submissions</div>
                <div className="ou-feedback-history-list">
                  {loadingHistory ? <div className="ou-history-empty">Loading your recent feedback...</div> : null}
                  {!loadingHistory && history.length === 0 ? <div className="ou-history-empty">No feedback submitted yet.</div> : null}
                  {!loadingHistory && history.map((item) => {
                    const statusMeta = feedbackStatusMeta(item.status);
                    return (
                      <div key={item.id} className="ou-history-item">
                        <span className={`ou-history-dot ${statusMeta.dotClass}`} aria-hidden="true" />
                        <div className="ou-history-body">
                          <div className="ou-history-title">{item.title}</div>
                          <div className="ou-history-meta">
                            {item.feedbackType} | {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span className={`ou-history-status ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="ou-feedback-sidebar-card">
                <div className="ou-feedback-sidebar-header">Other ways to reach us</div>
                <div className="ou-contact-card">
                  <a className="ou-contact-link" href="https://github.com/JJFrisch/OrbitUMD/issues/new/choose" target="_blank" rel="noreferrer noopener">
                    <ExternalLink size={14} /> GitHub Issues
                  </a>
                  <p className="ou-contact-link-desc">Open an issue for bugs or feature requests.</p>

                  <a className="ou-contact-link" href="mailto:orbitumd@umd.edu">
                    <Mail size={14} /> Email the team
                  </a>
                  <p className="ou-contact-link-desc">orbitumd@umd.edu - typical response within 48 hours.</p>

                  <a className="ou-contact-link" href="https://github.com/JJFrisch/OrbitUMD/discussions" target="_blank" rel="noreferrer noopener">
                    <MessageSquare size={14} /> Community discussions
                  </a>
                  <p className="ou-contact-link-desc">Join conversations with other students and contributors.</p>
                </div>
              </section>

              <section className="ou-feedback-sidebar-card emphasized">
                <div className="ou-feedback-sidebar-header">We read everything</div>
                <div className="ou-feedback-emphasis-text">
                  OrbitUMD is built by UMD students for UMD students. Every submission is reviewed, and urgent bugs are triaged quickly.
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
