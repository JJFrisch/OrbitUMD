import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  GraduationCap,
} from "lucide-react";
import {
  addUserDegreeProgramFromCatalogOption,
  listProgramCatalogOptions,
  listUserDegreePrograms,
  type CatalogProgramOption,
} from "@/lib/repositories/degreeProgramsRepository";
import { replacePriorCreditsByImportOrigin } from "@/lib/repositories/priorCreditsRepository";
import { getSupabaseClient } from "@/lib/supabase/client";
import TranscriptUploadPanel from "@/app/components/TranscriptUploadPanel";
import { buildTranscriptPriorCreditImport } from "@/lib/transcripts/transcriptCreditImport";
import type { TranscriptParseResult } from "@/lib/transcripts/unofficialTranscriptParser";
import "./onboarding-layout.css";

type GoalOption = {
  id: string;
  title: string;
  label: string;
  description: string;
  route: string;
  icon: typeof Calendar;
};

type StepDefinition = {
  id: string;
  label: string;
  caption: string;
};

const STEPS: StepDefinition[] = [
  { id: "profile", label: "Your Profile", caption: "Name, UID, and year" },
  { id: "major", label: "Major & Minors", caption: "Your academic path" },
  { id: "credits", label: "Transfer Credits", caption: "Import prior work" },
  { id: "goals", label: "Review & Launch", caption: "Choose your next action" },
];

const GOALS: GoalOption[] = [
  {
    id: "generate",
    title: "Generate Schedule",
    label: "Quick",
    description: "Generate class schedule combinations from your chosen courses.",
    route: "/generate-schedule",
    icon: Calendar,
  },
  {
    id: "build",
    title: "Build My Week",
    label: "Interactive",
    description: "Drag and drop classes onto a weekly calendar and compare options.",
    route: "/build-my-week",
    icon: CalendarDays,
  },
  {
    id: "plan",
    title: "Four-Year Plan",
    label: "Guided",
    description: "Build a full multi-semester plan and track degree progress.",
    route: "/four-year-plan",
    icon: GraduationCap,
  },
  {
    id: "audit",
    title: "Degree Audit",
    label: "Overview",
    description: "Review completed requirements and what remains for graduation.",
    route: "/degree-audit",
    icon: FileCheck2,
  },
];

function splitDisplayName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

async function loadAllUmdMajors(programOptions: CatalogProgramOption[]): Promise<CatalogProgramOption[]> {
  const byName = new Map<string, CatalogProgramOption>();

  for (const option of programOptions) {
    if (option.type !== "major") continue;
    byName.set(normalizeName(option.name), option);
  }

  try {
    const response = await fetch("https://api.umd.io/v1/majors/list");
    if (response.ok) {
      const payload = (await response.json()) as Array<{ major?: string }>;
      for (const row of payload) {
        const name = String(row.major ?? "").trim();
        if (!name) continue;
        const normalized = normalizeName(name);
        if (!byName.has(normalized)) {
          byName.set(normalized, {
            key: `api:${name}`,
            name,
            type: "major",
            programCode: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            source: "api",
          });
        }
      }
    }
  } catch {
    // Keep catalog-derived majors if the API is unavailable.
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildGraduationOptions(): string[] {
  const startYear = Math.max(new Date().getFullYear() - 1, 2025);
  const endYear = startYear + 14;
  const options: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    options.push(`May ${year}`);
    options.push(`December ${year}`);
  }
  return options;
}

export default function OnboardingContainer() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [currentYear, setCurrentYear] = useState("");
  const [graduation, setGraduation] = useState("");
  const [college, setCollege] = useState("");

  const [majorOptions, setMajorOptions] = useState<CatalogProgramOption[]>([]);
  const [minorOptions, setMinorOptions] = useState<CatalogProgramOption[]>([]);
  const [selectedMajorKey, setSelectedMajorKey] = useState("");
  const [selectedMinorSet, setSelectedMinorSet] = useState<Set<string>>(new Set());

  const [creditsMethod, setCreditsMethod] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>(GOALS[0].id);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const graduationOptions = useMemo(() => buildGraduationOptions(), []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [{ data: authData }, programOptions] = await Promise.all([
          supabase.auth.getUser(),
          listProgramCatalogOptions(),
        ]);

        if (!active) return;

        const majors = await loadAllUmdMajors(programOptions);
        const minors = programOptions
          .filter((option) => option.type === "minor")
          .sort((a, b) => a.name.localeCompare(b.name));

        setMajorOptions(majors);
        setMinorOptions(minors);
        if (majors[0]) {
          setSelectedMajorKey(majors[0].key);
        }

        const authUser = authData.user;
        if (!authUser) return;

        const [{ data: profileRow }, existingPrograms] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("display_name, email, university_uid")
            .eq("id", authUser.id)
            .maybeSingle(),
          listUserDegreePrograms(),
        ]);

        if (!active) return;

        const profileName = String(profileRow?.display_name ?? "").trim();
        if (profileName) {
          const split = splitDisplayName(profileName);
          setFirstName(split.firstName);
          setLastName(split.lastName);
        }

        setEmail(String(profileRow?.email ?? authUser.email ?? "").trim());
        setUid(String(profileRow?.university_uid ?? "").trim());

        const existingPrimary = existingPrograms.find((program) => program.isPrimary);
        if (existingPrimary) {
          const match = majors.find(
            (option) => normalizeName(option.name) === normalizeName(existingPrimary.programName),
          );
          if (match) {
            setSelectedMajorKey(match.key);
          }
        }

        const matchedMinorKeys = minors
          .filter((minorOption) => existingPrograms.some(
            (program) => normalizeName(program.programName) === normalizeName(minorOption.name),
          ))
          .map((minorOption) => minorOption.key);
        setSelectedMinorSet(new Set(matchedMinorKeys));
      } catch {
        if (!active) return;
        setStatusError("Unable to preload onboarding details. You can still continue.");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [supabase]);

  const selectedMajorOption = useMemo(
    () => majorOptions.find((option) => option.key === selectedMajorKey) ?? null,
    [majorOptions, selectedMajorKey],
  );

  const selectedGoal = useMemo(
    () => GOALS.find((goal) => goal.id === selectedGoalId) ?? GOALS[0],
    [selectedGoalId],
  );

  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const stepStates = useMemo(() => {
    return STEPS.map((step, index) => ({
      ...step,
      state:
        completedStepIds.has(step.id) || index < currentStepIndex
          ? "done"
          : index === currentStepIndex
            ? "active"
            : "pending",
    }));
  }, [completedStepIds, currentStepIndex]);

  const toggleMinor = (minorKey: string) => {
    setSelectedMinorSet((previous) => {
      const next = new Set(previous);
      if (next.has(minorKey)) {
        next.delete(minorKey);
      } else {
        next.add(minorKey);
      }
      return next;
    });
  };

  const applyTranscriptCreditImport = async (result: TranscriptParseResult) => {
    setStatusError(null);
    setStatusMessage(null);
    try {
      const transcriptImport = await buildTranscriptPriorCreditImport(result);
      await replacePriorCreditsByImportOrigin("testudo_transcript", transcriptImport.records);
      setCreditsMethod("Unofficial Transcript");
      setStatusMessage(`Imported ${transcriptImport.summary.importedRecords} prior-credit records from your transcript.`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to import transcript credits.");
    }
  };

  const persistProfile = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      throw new Error("Please enter your UMD email to continue.");
    }

    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const displayName = `${firstName} ${lastName}`.trim();

    const { error: upsertError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          id: authUser.id,
          email: trimmedEmail,
          display_name: displayName || null,
          university_uid: uid.trim() || null,
        },
        { onConflict: "id" },
      );

    if (upsertError) {
      throw new Error(upsertError.message || "Unable to save your onboarding profile.");
    }

    if (selectedMajorOption) {
      const existingPrograms = await listUserDegreePrograms();
      const alreadyLinked = existingPrograms.some(
        (program) => normalizeName(program.programName) === normalizeName(selectedMajorOption.name),
      );
      if (!alreadyLinked) {
        await addUserDegreeProgramFromCatalogOption(selectedMajorOption);
      }

      const selectedMinorOptions = minorOptions.filter((option) => selectedMinorSet.has(option.key));
      for (const minor of selectedMinorOptions) {
        const minorLinked = existingPrograms.some(
          (program) => normalizeName(program.programName) === normalizeName(minor.name),
        );
        if (!minorLinked) {
          await addUserDegreeProgramFromCatalogOption(minor);
        }
      }
    }
  };

  const handleNext = async () => {
    setStatusError(null);
    setStatusMessage(null);

    if (currentStepIndex === 0) {
      setSaving(true);
      try {
        await persistProfile();
        setCompletedStepIds((previous) => new Set([...previous, STEPS[0].id]));
        setCurrentStepIndex(1);
        setStatusMessage("Profile saved.");
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "Unable to continue.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (currentStepIndex >= STEPS.length - 1) {
      setSaving(true);
      try {
        await persistProfile();
        navigate(selectedGoal.route, { replace: true });
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "Unable to launch your plan.");
      } finally {
        setSaving(false);
      }
      return;
    }

    setCompletedStepIds((previous) => new Set([...previous, STEPS[currentStepIndex].id]));
    setCurrentStepIndex((previous) => Math.min(previous + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStatusError(null);
    setStatusMessage(null);
    if (currentStepIndex === 0) return;
    setCurrentStepIndex((previous) => Math.max(previous - 1, 0));
  };

  const handleSkip = () => {
    navigate("/dashboard", { replace: true });
  };

  const renderStepContent = (stepId: string) => {
    if (stepId === "profile") {
      return (
        <>
          <div className="onboarding-step-eyebrow">
            <div className="onboarding-eyebrow-pill">Step 1 of {STEPS.length}</div>
          </div>
          <h2 className="onboarding-step-title">Let&apos;s start with you.</h2>
          <p className="onboarding-step-sub">
            Tell us about yourself so we can personalize your four-year plan from day one.
          </p>

          <div className="onboarding-field-row">
            <div className="onboarding-field">
              <label htmlFor="onboarding-first-name">First Name</label>
              <input
                id="onboarding-first-name"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Alex"
              />
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboarding-last-name">Last Name</label>
              <input
                id="onboarding-last-name"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Johnson"
              />
            </div>
          </div>

          <div className="onboarding-field-row single">
            <div className="onboarding-field">
              <label htmlFor="onboarding-email">UMD Email</label>
              <input
                id="onboarding-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="yourid@umd.edu"
              />
            </div>
          </div>

          <div className="onboarding-field-row triple">
            <div className="onboarding-field">
              <label htmlFor="onboarding-uid">UID</label>
              <input
                id="onboarding-uid"
                type="text"
                value={uid}
                onChange={(event) => setUid(event.target.value)}
                placeholder="123456789"
              />
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboarding-year">Current Year</label>
              <select
                id="onboarding-year"
                value={currentYear}
                onChange={(event) => setCurrentYear(event.target.value)}
              >
                <option value="">Select year</option>
                <option value="Freshman">Freshman (1st)</option>
                <option value="Sophomore">Sophomore (2nd)</option>
                <option value="Junior">Junior (3rd)</option>
                <option value="Senior">Senior (4th)</option>
                <option value="Fifth">5th Year+</option>
              </select>
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboarding-grad">Expected Graduation</label>
              <select
                id="onboarding-grad"
                value={graduation}
                onChange={(event) => setGraduation(event.target.value)}
              >
                <option value="">Select term</option>
                {graduationOptions.map((termOption) => (
                  <option key={termOption} value={termOption}>{termOption}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="onboarding-field-row single">
            <div className="onboarding-field">
              <label htmlFor="onboarding-college">College / School</label>
              <select
                id="onboarding-college"
                value={college}
                onChange={(event) => setCollege(event.target.value)}
              >
                <option value="">Select your college</option>
                <option value="CMNS">College of Computer, Mathematical, and Natural Sciences</option>
                <option value="Engineering">A. James Clark School of Engineering</option>
                <option value="Business">Robert H. Smith School of Business</option>
                <option value="ARHU">College of Arts and Humanities</option>
                <option value="BSOS">College of Behavioral and Social Sciences</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </>
      );
    }

    if (stepId === "major") {
      return (
        <>
          <div className="onboarding-step-eyebrow">
            <div className="onboarding-eyebrow-pill">Step 2 of {STEPS.length}</div>
          </div>
          <h2 className="onboarding-step-title">What are you studying?</h2>
          <p className="onboarding-step-sub">
            Select your primary major and optional minors. You can adjust these later in Settings.
          </p>

          <div className="onboarding-field-row single">
            <div className="onboarding-field">
              <label htmlFor="onboarding-major">Primary Major</label>
              <select
                id="onboarding-major"
                value={selectedMajorKey}
                onChange={(event) => setSelectedMajorKey(event.target.value)}
              >
                <option value="">Select a major</option>
                {majorOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="onboarding-step-sub" style={{ marginBottom: 10 }}>
            Add a minor or certificate (optional)
          </div>
          <div className="onboarding-chip-group">
            {minorOptions.map((minor) => (
              <button
                key={minor.key}
                className={`onboarding-chip ${selectedMinorSet.has(minor.key) ? "selected" : ""}`}
                type="button"
                onClick={() => toggleMinor(minor.key)}
              >
                {minor.name}
              </button>
            ))}
          </div>
        </>
      );
    }

    if (stepId === "credits") {
      return (
        <>
          <div className="onboarding-step-eyebrow">
            <div className="onboarding-eyebrow-pill">Step 3 of {STEPS.length}</div>
          </div>
          <h2 className="onboarding-step-title">Any credits to bring in?</h2>
          <p className="onboarding-step-sub">
            Import AP, IB, dual enrollment, or transfer credit. OrbitUMD can map these automatically.
          </p>

          <TranscriptUploadPanel
            className="onboarding-import-zone-wrap"
            instructions={[
              "Go to testudo.umd.edu and open your unofficial transcript in Testudo.",
              "Use your browser Print action and save the transcript as a PDF.",
              "Upload that PDF here and OrbitUMD will parse and import your prior credits.",
            ]}
            onParsed={applyTranscriptCreditImport}
          />

          <button
            className="onboarding-import-zone"
            type="button"
            onClick={() => navigate("/credit-import?onboarding=1")}
          >
            <h4>Need AP/IB/transfer manual edits?</h4>
            <p>Open the full credit import page to review or add records manually.</p>
          </button>

          <div className="onboarding-step-sub" style={{ marginBottom: 10 }}>
            Select how you want to continue
          </div>
          <div className="onboarding-chip-group">
            {["Unofficial Transcript", "AP Exams", "IB Credits", "Transfer Credits", "Dual Enrollment"].map((method) => (
              <button
                key={method}
                className={`onboarding-chip ${creditsMethod === method ? "selected" : ""}`}
                type="button"
                onClick={() => setCreditsMethod(method)}
              >
                {method}
              </button>
            ))}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="onboarding-step-eyebrow">
          <div className="onboarding-eyebrow-pill">Step 4 of {STEPS.length}</div>
        </div>
        <h2 className="onboarding-step-title">You&apos;re all set, Terp.</h2>
        <p className="onboarding-step-sub">
          Choose what you want to do first. You can switch workflows anytime after launch.
        </p>

        <div className="onboarding-goal-grid">
          {GOALS.map((goal) => {
            const Icon = goal.icon;
            const isSelected = selectedGoalId === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                className={`onboarding-goal-card ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedGoalId(goal.id)}
              >
                <div className="onboarding-goal-icon">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="onboarding-goal-badge">{goal.label}</span>
                <h3 className="onboarding-goal-title">{goal.title}</h3>
                <p className="onboarding-goal-description">{goal.description}</p>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-rail">
        <button
          className="onboarding-logo"
          onClick={() => navigate("/")}
          aria-label="Back to home"
          type="button"
        >
          <span className="onboarding-logo-text">Orbit<span>UMD</span></span>
        </button>

        <nav className="onboarding-step-nav">
          {stepStates.map((step, index) => (
            <div
              key={step.id}
              className={`onboarding-step-item ${step.state}`}
            >
              <div className="onboarding-step-num">
                {step.state === "done" ? "✓" : index + 1}
              </div>
              <div className="onboarding-step-info">
                <div className="onboarding-step-label">{step.label}</div>
                <div className="onboarding-step-caption">{step.caption}</div>
              </div>
            </div>
          ))}
        </nav>

        <div className="onboarding-rail-footer">
          <p>
            Already have a full profile? You can skip setup and go straight to your dashboard.
          </p>
        </div>
      </aside>

      <div className="onboarding-main">
        <div className="onboarding-topbar">
          <div>
            <div className="onboarding-progress-wrap">
              <div className="onboarding-progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="onboarding-progress-label">
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <button className="onboarding-topbar-skip" type="button" onClick={handleSkip}>
            Skip setup →
          </button>
        </div>

        <div className="onboarding-steps-container">
          {stepStates.map((step, index) => (
            <section
              key={step.id}
              className={`onboarding-step-panel ${index === currentStepIndex ? "active" : ""} ${index < currentStepIndex ? "exit" : ""}`}
            >
              {renderStepContent(step.id)}
            </section>
          ))}
        </div>

        <div className="onboarding-bottom-nav">
          <button
            className="onboarding-btn-back"
            type="button"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || saving}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="onboarding-step-counter">
            Step {currentStepIndex + 1} of {STEPS.length}
          </span>
          <button
            className={`onboarding-btn-next ${currentStepIndex === STEPS.length - 1 ? "finish" : ""}`}
            type="button"
            onClick={() => void handleNext()}
            disabled={saving}
          >
            {currentStepIndex === STEPS.length - 1 ? "Launch my plan" : "Continue"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {(statusMessage || statusError) && (
          <div style={{ padding: "0 64px 20px", zIndex: 5 }}>
            {statusMessage && (
              <p style={{ fontSize: "0.78rem", color: "#2E7D32" }}>{statusMessage}</p>
            )}
            {statusError && (
              <p style={{ fontSize: "0.78rem", color: "#B71C1C" }}>{statusError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
