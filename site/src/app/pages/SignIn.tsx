import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getSupabaseClient } from "@/lib/supabase/client";
import "./signin-login.css";

const AUTH_FLOW_KEY = "orbitumd:auth:flow";

function buildAppRedirectUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${base}${normalizedPath}`;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const supabase = getSupabaseClient();
  const nextPath = searchParams.get("next") || "/dashboard";
  const isAuthCallback = ["code", "access_token", "refresh_token", "token_hash", "type", "error_description"]
    .some((key) => searchParams.has(key));

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authNavigationStarted = useRef(false);

  useEffect(() => {
    let active = true;

    const ensureProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!authUser) return;

      const displayName =
        String(authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? "").trim() || null;

      await supabase
        .from("user_profiles")
        .upsert(
          {
            id: authUser.id,
            email: authUser.email ?? null,
            display_name: displayName,
          },
          { onConflict: "id" },
        );
    };

    const resolvePostAuthPath = async (authUser: { id: string }, requestedPath: string) => {
      if (requestedPath && requestedPath !== "/onboarding") {
        return requestedPath;
      }

      const [{ data: profileRow, error: profileError }, { count: programCount, error: programError }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, display_name, university_uid")
          .eq("id", authUser.id)
          .maybeSingle(),
        supabase
          .from("user_degree_programs")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", authUser.id),
      ]);

      const hasProfileRow = !profileError && Boolean(profileRow?.id);
      const hasProfileDetails = Boolean(
        String(profileRow?.display_name ?? "").trim()
          || String(profileRow?.university_uid ?? "").trim(),
      );
      const hasPrograms = !programError && (programCount ?? 0) > 0;
      const isExistingUser = hasProfileRow && (hasProfileDetails || hasPrograms);

      return isExistingUser ? "/dashboard" : "/onboarding";
    };

    const navigateAfterAuth = async (authUser: { id: string }) => {
      if (authNavigationStarted.current) return;
      authNavigationStarted.current = true;
      try {
        const destination = await resolvePostAuthPath(authUser, nextPath);
        sessionStorage.removeItem(AUTH_FLOW_KEY);
        await ensureProfile();
        if (active) {
          navigate(destination, { replace: true });
        }
      } finally {
        if (active) {
          authNavigationStarted.current = false;
        }
      }
    };

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.user) {
        await navigateAfterAuth(data.session.user);
      }
    };

    void run();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        void navigateAfterAuth(session.user);
      }
    });

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [isAuthCallback, navigate, nextPath, supabase]);

  const handleEmailSignIn = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      sessionStorage.setItem(AUTH_FLOW_KEY, "pending");
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          // Route auth callbacks through an app route that always exists under the configured base path.
          emailRedirectTo: buildAppRedirectUrl(`/sign-in?next=${encodeURIComponent(nextPath)}`),
        },
      });

      if (signInError) {
        throw signInError;
      }

      setMessage("Check your email for a sign-in link.");
    } catch (err) {
      sessionStorage.removeItem(AUTH_FLOW_KEY);
      const msg = err instanceof Error ? err.message : "Unable to sign in with email.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      sessionStorage.setItem(AUTH_FLOW_KEY, "pending");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: buildAppRedirectUrl(`/sign-in?next=${encodeURIComponent(nextPath)}`),
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (err) {
      sessionStorage.removeItem(AUTH_FLOW_KEY);
      const msg = err instanceof Error ? err.message : `Unable to sign in with ${provider}.`;
      setError(msg);
      setLoading(false);
    }
  };

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const orbitRingsRef = useRef<(HTMLDivElement | null)[]>([]);

  const handleMouseMove = (event: MouseEvent) => {
    if (!leftPanelRef.current) return;
    
    const rect = leftPanelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const angle = Math.atan2(dy, dx);

    const ringConfigs = [
      { radius: 120, duration: 55 },
      { radius: 200, duration: 80 },
      { radius: 280, duration: 110 },
    ];

    ringConfigs.forEach((config, index) => {
      const ring = orbitRingsRef.current[index];
      if (ring) {
        const dot = ring.querySelector(".signin-orbit-dot") as HTMLElement;
        if (dot) {
          const x = config.radius * Math.cos(angle);
          const y = config.radius * Math.sin(angle);
          dot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        }
      }
    });
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="signin-shell">
      {/* LEFT PANEL */}
      <div className="signin-left" ref={leftPanelRef}>
        {/* Logo Button */}
        <button
          className="signin-logo-btn"
          onClick={() => navigate("/")}
          type="button"
          aria-label="Back to home"
        >
          <span className="signin-logo-text">OrbitUMD</span>
        </button>

        {/* Orbit Rings with Cursor-Tracking Dots */}
        <div className="signin-orbits">
          <div
            className="signin-orbit-ring signin-orbit-ring-1"
            ref={(el) => { if (el) orbitRingsRef.current[0] = el; }}
          >
            <div className="signin-orbit-dot"></div>
          </div>
          <div
            className="signin-orbit-ring signin-orbit-ring-2"
            ref={(el) => { if (el) orbitRingsRef.current[1] = el; }}
          >
            <div className="signin-orbit-dot"></div>
          </div>
          <div
            className="signin-orbit-ring signin-orbit-ring-3"
            ref={(el) => { if (el) orbitRingsRef.current[2] = el; }}
          >
            <div className="signin-orbit-dot"></div>
          </div>
        </div>

        {/* Testimonial Section */}
        <div className="signin-testimonial">
          <p className="signin-testimonial-text">
            "OrbitUMD helped me navigate my degree requirements with clarity and confidence."
          </p>
          <p className="signin-testimonial-author">— A UMD Student</p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="signin-right">
        <div className="signin-form-wrapper">
          {/* Eyebrow with red line */}
          <div className="signin-eyebrow">
            <span className="signin-eyebrow-line"></span>
            <span className="signin-eyebrow-text">Sign in or create account</span>
          </div>

          {/* Form Title and Description */}
          <h1 className="signin-form-title">Welcome back.</h1>
          <p className="signin-form-description">
            Sign in to access your degree plan and course recommendations.
          </p>

          {/* SSO Buttons */}
          <div className="signin-sso-buttons">
            <button
              className="signin-sso-btn signin-sso-google"
              onClick={() => void handleOAuth("google")}
              disabled={loading}
              type="button"
              aria-label="Sign in with Google"
            >
              <svg className="signin-sso-icon" viewBox="0 0 24 24" fill="none">
                <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold">
                  G
                </text>
              </svg>
              <span>Google</span>
            </button>
            <button
              className="signin-sso-btn signin-sso-apple"
              onClick={() => void handleOAuth("apple")}
              disabled={loading}
              type="button"
              aria-label="Sign in with Apple"
            >
              <svg className="signin-sso-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 13.5c-.2-2.5 1.7-3.7 1.8-3.8-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6 1 8 .7 1 1.5 2.1 2.7 2.1 1 0 1.6-.7 3-1.2 1.3-.5 2.5-.7 3.6-.7 1.1 0 2.5.2 3.5 1.3-1.6 1.2-3.8 2.1-5.6 2.1-3 0-5.6-1.9-7.1-4.8-1.5-3-1.2-7 .5-9.5 1.5-2 3.9-3.3 6.6-3.3 1.7 0 3.1.5 4.1 1.4 1.1 1 1.7 2.2 1.8 3.5z" />
              </svg>
              <span>Apple</span>
            </button>
          </div>

          {/* Divider */}
          <div className="signin-divider">
            <span className="signin-divider-line"></span>
            <span className="signin-divider-text">or sign in with email</span>
            <span className="signin-divider-line"></span>
          </div>

          {/* Email Form */}
          <div className="signin-form-group">
            <label htmlFor="signin-email" className="signin-label">Email Address</label>
            <div className="signin-input-wrapper">
              <svg className="signin-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 8l9 6 9-6M3 8v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                id="signin-email"
                type="email"
                className="signin-input"
                placeholder="you@umd.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim() && !loading) {
                    handleEmailSignIn();
                  }
                }}
              />
            </div>
          </div>

          {/* Remember & Forgot Password */}
          <div className="signin-form-footer">
            <label className="signin-checkbox">
              <input type="checkbox" defaultChecked className="signin-checkbox-input" />
              <span>Remember me</span>
            </label>
            <button
              className="signin-forgot-link"
              onClick={() => navigate("/forgot-password")}
              type="button"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit Button */}
          <button
            className="signin-submit-btn"
            onClick={handleEmailSignIn}
            disabled={loading || !email.trim()}
            type="button"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          {/* Messages */}
          {message && (
            <div className="signin-message signin-message-success">
              {message}
            </div>
          )}
          {error && (
            <div className="signin-message signin-message-error">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
