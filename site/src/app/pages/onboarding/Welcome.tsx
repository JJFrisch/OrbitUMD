import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getSupabaseClient } from "@/lib/supabase/client";
import { enableDemoMode } from "@/lib/demo/demoMode";
import "./welcome-landing.css";

export default function Welcome() {
  const navigate = useNavigate();
  const ring1Ref = useRef<HTMLDivElement | null>(null);
  const ring2Ref = useRef<HTMLDivElement | null>(null);
  const ring3Ref = useRef<HTMLDivElement | null>(null);

  // Statistics state
  const [semestersMapped, setSemestersMapped] = useState(0);
  const [majorMinorCount, setMajorMinorCount] = useState(0);

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

  // Load available majors & minors and schedule count from public metrics RPC
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    supabase
      .rpc("get_orbit_public_metrics")
      .then((result) => {
        if (!active) return;
        if (result.error) {
          console.warn("Failed to load metrics:", result.error);
          return;
        }
        if (result.data && result.data.length > 0) {
          const metrics = result.data[0];
          setSemestersMapped(Number(metrics.total_schedules_mapped ?? 0));
          setMajorMinorCount(Number(metrics.total_majors_and_minors ?? 0));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="welcome-landing-page">
      <div className="welcome-bg-shape welcome-bg-shape-1" />
      <div className="welcome-bg-shape welcome-bg-shape-2" />
      <div className="welcome-bg-shape welcome-bg-shape-3" />

      <div className="welcome-wrapper">
        <header className="welcome-header">
          <button className="welcome-logo" type="button" onClick={() => navigate("/")}>
            <span className="sidebar-logo-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <circle cx="12" cy="12" r="3" stroke="#EF5350" strokeWidth="2" />
              <circle cx="19" cy="5" r="2" stroke="#EF5350" strokeWidth="2" />
              <circle cx="5" cy="19" r="2" stroke="#EF5350" strokeWidth="2" />
              <path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" stroke="#EF5350" strokeWidth="2" strokeDasharray="3 2" strokeLinejoin="round" />
              <path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" stroke="#EF5350" strokeWidth="2" strokeDasharray="3 2" strokeLinejoin="round" />
            </svg>
          </span>
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
              className="welcome-nav-demo"
              onClick={() => { enableDemoMode(); window.location.href = "/dashboard"; }}
            >
              Try Demo
            </button>
            <button
              type="button"
              className="welcome-nav-cta"
              onClick={() => navigate("/sign-in?next=/onboarding")}
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
              <br/> build your UMD Orbit in one place.
            </p>

            <div className="welcome-stats">
              <div className="welcome-stat">
                <div className="welcome-stat-num">{semestersMapped.toLocaleString()}</div>
                <div className="welcome-stat-label">Schedules mapped</div>
              </div>
              <div className="welcome-stat">
                <div className="welcome-stat-num">"247"</div>
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
                onClick={() => navigate("/sign-in?next=/onboarding")}
              >
                Let's get started
              </button>
              <button
                className="welcome-btn-ghost"
                type="button"
                onClick={() => navigate("/sign-in?next=/onboarding")}
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