import { useEffect, useMemo, useState } from "react";
import { Bug, Check, ExternalLink, Lightbulb, Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { createUserFeedbackSubmission, listUserFeedbackSubmissions, type FeedbackType, type UserFeedbackSubmission } from "@/lib/repositories/userFeedbackRepository";
import "./suggestions-template.css";

type SuggestionsTab = "courses" | "feedback";
type CourseFilter = "all" | "ge" | "major" | "minor" | "easy";

interface SuggestedCourse {
  code: string;
  credits: number;
  name: string;
  why: string;
  seats: string;
  seatsLow?: boolean;
  meeting: string;
  tags: Array<Exclude<CourseFilter, "all">>;
}

const SUGGESTED_COURSES: SuggestedCourse[] = [
  {
    code: "PSYC100",
    credits: 3,
    name: "Introduction to Psychology",
    why: "Fills your Social Science Gen Ed gap and still has many open seats this term.",
    seats: "Open: 94/120 seats",
    meeting: "MWF 10:00-11:00 AM | TYD 1101",
    tags: ["ge", "easy"],
  },
  {
    code: "PHIL101",
    credits: 3,
    name: "Introduction to Philosophy",
    why: "Covers a remaining Humanities Gen Ed requirement with flexible section timing.",
    seats: "Only 8 seats left",
    seatsLow: true,
    meeting: "TTh 12:30-1:45 PM | SKN 1116",
    tags: ["ge"],
  },
  {
    code: "CMSC330",
    credits: 3,
    name: "Organization of Programming Languages",
    why: "Core CS major requirement and prerequisite for later upper-level tracks.",
    seats: "Open: 22/50 seats",
    meeting: "MWF 11:00 AM-12:00 PM | IRB 0318",
    tags: ["major"],
  },
  {
    code: "MATH415",
    credits: 3,
    name: "Applied Harmonic Analysis",
    why: "Strong fit for finishing a math minor while pairing well with planned electives.",
    seats: "Open: 12/30 seats",
    meeting: "TTh 2:00-3:15 PM | MTH 0102",
    tags: ["minor"],
  },
  {
    code: "CMSC388F",
    credits: 1,
    name: "Functional Programming in Haskell",
    why: "Light-credit CS elective that can improve progress without overloading your week.",
    seats: "Open: 14/25 seats",
    meeting: "F 2:00-3:00 PM | IRB 1116",
    tags: ["major", "easy"],
  },
  {
    code: "CMSC422",
    credits: 3,
    name: "Introduction to Machine Learning",
    why: "Upper-level CS elective that can satisfy one of your remaining specialization slots.",
    seats: "Only 5 seats left",
    seatsLow: true,
    meeting: "TTh 3:30-4:45 PM | ESJ 0224",
    tags: ["major"],
  },
];

const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { value: "feature", label: "Feature", icon: Lightbulb },
  { value: "bug", label: "Bug", icon: Bug },
  { value: "other", label: "Contact", icon: Mail },
];

function feedbackStatusMeta(status: UserFeedbackSubmission["status"]): {
  dotClass: "open" | "review" | "done";
  badgeClass: "open" | "review" | "done";
  label: string;
} {
  if (status === "new") {
    return { dotClass: "open", badgeClass: "open", label: "Open" };
  }
  if (status === "reviewing") {
    return { dotClass: "review", badgeClass: "review", label: "In Review" };
  }
  if (status === "resolved") {
    return { dotClass: "done", badgeClass: "done", label: "Shipped" };
  }
  return { dotClass: "done", badgeClass: "done", label: "Closed" };
}

export default function Suggestions() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SuggestionsTab>("courses");
  const [activeFilter, setActiveFilter] = useState<CourseFilter>("all");
  const [type, setType] = useState<FeedbackType>("feature");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addedCourseCodes, setAddedCourseCodes] = useState<string[]>([]);
  const [history, setHistory] = useState<UserFeedbackSubmission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const filteredCourses = useMemo(() => {
    if (activeFilter === "all") return SUGGESTED_COURSES;
    return SUGGESTED_COURSES.filter((course) => course.tags.includes(activeFilter));
  }, [activeFilter]);

  useEffect(() => {
    let active = true;
    void listUserFeedbackSubmissions()
      .then((rows) => {
        if (!active) return;
        setHistory(rows);
      })
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Unable to load feedback history.");
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const markAddedToPlan = (code: string) => {
    setAddedCourseCodes((prev) => {
      if (prev.includes(code)) return prev;
      return [...prev, code];
    });
    toast.success(`Opening ${code} in the Schedule Builder…`);
    navigate(`/schedule-builder?search=${encodeURIComponent(code)}`);
  };

  return (
    <div className="ou-suggestions-page">
      <div className="ou-suggestions-topbar">
        <h1>Suggestions &amp; <em style={{ color: "#c62828" }}>Help</em> </h1>
        <p>Course recommendations tailored to your plan, plus a direct line to the OrbitUMD team.</p>
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

      {activeTab === "courses" ? (
        <div className="ou-suggestions-content">
          <div className="ou-suggestions-hero">
            <h3>Smart picks for your upcoming gaps</h3>
            <p>
              Based on your major requirements, Gen Ed gaps, and schedule load, these courses can push your degree progress forward.
            </p>
          </div>

          <div className="ou-suggestions-filters">
            <button
              type="button"
              className={`ou-suggestions-filter ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              All recommendations
            </button>
            <button
              type="button"
              className={`ou-suggestions-filter ${activeFilter === "ge" ? "active" : ""}`}
              onClick={() => setActiveFilter("ge")}
            >
              Gen Ed gaps
            </button>
            <button
              type="button"
              className={`ou-suggestions-filter ${activeFilter === "major" ? "active" : ""}`}
              onClick={() => setActiveFilter("major")}
            >
              Major requirements
            </button>
            <button
              type="button"
              className={`ou-suggestions-filter ${activeFilter === "minor" ? "active" : ""}`}
              onClick={() => setActiveFilter("minor")}
            >
              Minor completion
            </button>
            <button
              type="button"
              className={`ou-suggestions-filter ${activeFilter === "easy" ? "active" : ""}`}
              onClick={() => setActiveFilter("easy")}
            >
              Low workload
            </button>
          </div>

          <div className="ou-course-grid">
            {filteredCourses.map((course, index) => {
              const isAdded = addedCourseCodes.includes(course.code);

              return (
                <article key={course.code} className="ou-course-card" style={{ animationDelay: `${index * 0.03}s` }}>
                  <div className="ou-course-card-top">
                    <div className="ou-course-row-1">
                      <span className="ou-course-code">{course.code}</span>
                      <span className="ou-course-credits">{course.credits} credits</span>
                    </div>

                    <div className="ou-course-name">{course.name}</div>

                    <div className="ou-course-tags">
                      {course.tags.includes("ge") ? <span className="ou-course-tag ge">Gen Ed</span> : null}
                      {course.tags.includes("major") ? <span className="ou-course-tag major">Major</span> : null}
                      {course.tags.includes("minor") ? <span className="ou-course-tag minor">Minor</span> : null}
                      {course.tags.includes("easy") ? <span className="ou-course-tag easy">Low workload</span> : null}
                    </div>

                    <div className="ou-course-why">{course.why}</div>

                    <div className={`ou-course-seats ${course.seatsLow ? "low" : ""}`}>{course.seats}</div>
                  </div>

                  <div className="ou-course-card-bottom">
                    <span className="ou-course-meeting">{course.meeting}</span>
                    <div className="ou-course-actions">
                      <button
                        type="button"
                        className="ou-course-btn"
                        onClick={() => navigate(`/schedule-builder?search=${encodeURIComponent(course.code)}`)}
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        className={`ou-course-btn add ${isAdded ? "added" : ""}`}
                        onClick={() => markAddedToPlan(course.code)}
                        disabled={isAdded}
                      >
                        {isAdded ? (
                          <>
                            <Check size={12} /> Added
                          </>
                        ) : (
                          "+ Add to plan"
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "feedback" ? (
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
                  <a className="ou-contact-link" href="https://github.com/JJFrisch/OrbitUMD/issues/new/choose" target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> GitHub Issues
                  </a>
                  <p className="ou-contact-link-desc">Open an issue for bugs or feature requests.</p>

                  <a className="ou-contact-link" href="mailto:orbitumd@umd.edu">
                    <Mail size={14} /> Email the team
                  </a>
                  <p className="ou-contact-link-desc">orbitumd@umd.edu - typical response within 48 hours.</p>

                  <a className="ou-contact-link" href="https://github.com/JJFrisch/OrbitUMD/discussions" target="_blank" rel="noreferrer">
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
      ) : null}
    </div>
  );
}