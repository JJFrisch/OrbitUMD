import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import "./welcome-landing.css";

export default function Welcome() {
  const navigate = useNavigate();
  const ring1Ref = useRef<HTMLDivElement | null>(null);
  const ring2Ref = useRef<HTMLDivElement | null>(null);
  const ring3Ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const angle = Math.atan2(dy, dx);

      const rings = [
        { ref: ring1Ref, radius: 210 },
        { ref: ring2Ref, radius: 310 },
        { ref: ring3Ref, radius: 410 },
      ];

      rings.forEach(({ ref, radius }) => {
        if (ref.current) {
          const dot = ref.current.querySelector('.welcome-orbit-dot');
          if (dot instanceof HTMLElement) {
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            dot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
          }
        }
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="welcome-landing-page">
      <div className="welcome-bg-shape welcome-bg-shape-1" />
      <div className="welcome-bg-shape welcome-bg-shape-2" />
      <div className="welcome-bg-shape welcome-bg-shape-3" />

      <div className="welcome-wrapper">
        <header className="welcome-header">
          <button className="welcome-logo" type="button" onClick={() => navigate("/")}>
            <svg className="welcome-logo-icon" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="4" fill="#D32F2F" />
              <circle cx="18" cy="18" r="10" stroke="#D32F2F" strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="18" cy="8" r="2.5" fill="#D32F2F" />
              <circle cx="26.66" cy="23" r="1.8" fill="#EF5350" opacity="0.7" />
              <circle cx="9.34" cy="23" r="1.4" fill="#EF5350" opacity="0.5" />
            </svg>
            <span className="welcome-logo-text">
              Orbit<span>UMD</span>
            </span>
          </button>

          <nav className="welcome-nav">
            <button type="button" onClick={() => navigate("/degree-requirements")}>Majors & Minors</button>
            <button type="button" onClick={() => navigate("/gen-eds")}>Gen Eds</button>
            <button type="button" onClick={() => navigate("/schedules")}>Schedules</button>
            <button
              type="button"
              className="welcome-nav-cta"
              onClick={() => navigate("/sign-in?next=/onboarding/profile")}
            >
              Get Started →
            </button>
          </nav>
        </header>

        <main className="welcome-hero">
          <div className="welcome-orbit-ring welcome-orbit-ring-1" ref={ring1Ref}>
            <div className="welcome-orbit-dot" />
          </div>
          <div className="welcome-orbit-ring welcome-orbit-ring-2" ref={ring2Ref}>
            <div className="welcome-orbit-dot" />
          </div>
          <div className="welcome-orbit-ring welcome-orbit-ring-3" ref={ring3Ref}>
            <div className="welcome-orbit-dot" />
          </div>

          <div className="welcome-hero-content">
            <div className="welcome-badge">
              <span className="welcome-badge-dot" />
              Built for Terps · University of Maryland
            </div>

            <h1 className="welcome-title">
              Design your <em>college&nbsp;journey.</em>
               {/* ,<br />not just your next semester. */}
            </h1>

            <p className="welcome-subtitle">
              Import your credits, map out majors and minors, discover Gen Eds, and generate class schedules that fit your life: 
              build your UMD Orbit in one place.
            </p>

            <div className="welcome-stats">
              <div className="welcome-stat">
                <div className="welcome-stat-num">8</div>
                <div className="welcome-stat-label">Semesters mapped</div>
              </div>
              <div className="welcome-stat">
                <div className="welcome-stat-num">100+</div>
                <div className="welcome-stat-label">Majors & minors</div>
              </div>
              <div className="welcome-stat">
                <div className="welcome-stat-num">0</div>
                <div className="welcome-stat-label">Requirements missed</div>
              </div>
            </div>

            <div className="welcome-cta-group">
              <button
                className="welcome-btn-primary"
                type="button"
                onClick={() => navigate("/sign-in?next=/onboarding/profile")}
              >
                Let's get started
              </button>
              <button
                className="welcome-btn-ghost"
                type="button"
                onClick={() => navigate("/onboarding/goals")}
              >
                See how it works <span className="welcome-arrow">→</span>
              </button>
            </div>
            <p className="welcome-cta-note">Change your plan at any time — OrbitUMD updates everything automatically.</p>
          </div>
        </main>

        <div className="welcome-features">
          <div className="welcome-features-content">
            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                  <path d="M3 9h12M9 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="welcome-feature-text">
                <h3>Import Credits</h3>
                <p>Bring in AP, IB, and transfer credits instantly. Your history, respected.</p>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                  <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <div className="welcome-feature-text">
                <h3>Map Requirements</h3>
                <p>Every Gen Ed, major, and minor requirement tracked and visualized in real time.</p>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M9 5v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="welcome-feature-text">
                <h3>Smart Schedules</h3>
                <p>Generate conflict-free semester plans that match your workload and preferences.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}