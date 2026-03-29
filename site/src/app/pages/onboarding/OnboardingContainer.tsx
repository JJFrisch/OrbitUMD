import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./onboarding-layout.css";
import BasicProfile from "./BasicProfile";
import GoalSelection from "./GoalSelection";

interface Step {
  id: string;
  label: string;
  caption?: string;
  renderComponent: () => React.ReactNode;
}

export default function OnboardingContainer() {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, STEPS[currentStepIndex].id]));
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // Onboarding complete, go to dashboard
      navigate("/dashboard", { replace: true });
    }
  };

  const STEPS: Step[] = [
    {
      id: "profile",
      label: "Profile",
      caption: "Your info",
      renderComponent: () => <BasicProfile onNext={handleNext} />,
    },
    {
      id: "goals",
      label: "Choose goal",
      caption: "What's next?",
      renderComponent: () => <GoalSelection />,
    },
  ];

  const currentStep = STEPS[currentStepIndex];
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSkip = () => {
    navigate("/dashboard", { replace: true });
  };

  const stepStates = useMemo(() => {
    return STEPS.map((step, index) => ({
      ...step,
      state:
        completedSteps.has(step.id) || index < currentStepIndex
          ? "done"
          : index === currentStepIndex
            ? "active"
            : "pending",
    }));
  }, [currentStepIndex, completedSteps]);

  return (
    <div className="onboarding-shell">
      {/* LEFT RAIL */}
      <div className="onboarding-rail">
        {/* Logo */}
        <button
          className="onboarding-logo"
          onClick={() => navigate("/")}
          aria-label="Back to home"
        >
          <span className="onboarding-logo-text">
            Orbit<span>UMD</span>
          </span>
        </button>

        {/* Step Navigation */}
        <div className="onboarding-step-nav">
          {stepStates.map((step) => (
            <div
              key={step.id}
              className={`onboarding-step-item ${step.state}`}
            >
              <div className="onboarding-step-num">
                {step.state === "done" ? "✓" : STEPS.findIndex((s) => s.id === step.id) + 1}
              </div>
              <div className="onboarding-step-info">
                <div className="onboarding-step-label">{step.label}</div>
                {step.caption && (
                  <div className="onboarding-step-caption">{step.caption}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Rail Footer */}
        <div className="onboarding-rail-footer">
          <p>
            This onboarding takes 2-3 minutes and helps us personalize your
            degree plan. You can update everything later.
          </p>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="onboarding-main">
        {/* Topbar */}
        <div className="onboarding-topbar">
          <div>
            <div className="onboarding-progress-wrap">
              <div
                className="onboarding-progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="onboarding-progress-label">
              Step {currentStepIndex + 1} of {STEPS.length}
            </div>
          </div>
          <button
            className="onboarding-topbar-skip"
            onClick={handleSkip}
            type="button"
          >
            Skip for now
          </button>
        </div>

        {/* Step Container */}
        <div className="onboarding-steps-container">
          {stepStates.map((step, index) => (
            <div
              key={step.id}
              className={`onboarding-step-panel ${
                index === currentStepIndex ? "active" : ""
              } ${
                index < currentStepIndex ? "exit" : ""
              }`}
            >
              {step.renderComponent()}
            </div>
          ))}
        </div>

        {/* Bottom Nav */}
        <div className="onboarding-bottom-nav">
          <button
            className="onboarding-btn-back"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            type="button"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <span className="onboarding-step-counter">
            {currentStepIndex + 1} of {STEPS.length}
          </span>
          <button
            className={`onboarding-btn-next ${
              currentStepIndex === STEPS.length - 1 ? "finish" : ""
            }`}
            onClick={handleNext}
            type="button"
          >
            {currentStepIndex === STEPS.length - 1 ? (
              <>
                <span>Let's go</span>
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
