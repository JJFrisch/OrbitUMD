import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getProfileEmailSnapshot } from "@/lib/supabase/profileEmailGate";
import "./signin-login.css";

const AUTH_FLOW_KEY = "orbitumd:auth:flow";
const AUTH_CALLBACK_SEARCH_KEYS = ["code", "access_token", "refresh_token", "token_hash", "type", "error_description", "error"];
const AUTH_CALLBACK_HASH_KEYS = ["access_token", "refresh_token", "token_hash", "type", "error_description", "error"];

type LegalModalType = "terms" | "privacy" | null;

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
  const isAuthCallback =
    AUTH_CALLBACK_SEARCH_KEYS.some((key) => searchParams.has(key))
    || (typeof window !== "undefined"
      && AUTH_CALLBACK_HASH_KEYS.some((key) =>
        new URLSearchParams(window.location.hash.replace(/^#/, "")).has(key),
      ));

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLegalModal, setOpenLegalModal] = useState<LegalModalType>(null);
  const authNavigationStarted = useRef(false);

  useEffect(() => {
    let active = true;

    const ensureProfile = async (authUserInput?: {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown>;
    }) => {
      const authUser = authUserInput ?? (await supabase.auth.getUser()).data.user;
      if (!authUser) return;

      const displayName =
        String(authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? "").trim() || null;

      await supabase
        .from("user_profiles")
        .upsert(
          {
            id: authUser.id,
            display_name: displayName,
            email: authUser.email ?? null,
          },
          { onConflict: "id" },
        );
    };

    const resolvePostAuthPath = async (authUser: { id: string }, requestedPath: string) => {
      const [{ hasProfileEmail }, { data: profileRow, error: profileError }, { count: programCount, error: programError }] = await Promise.all([
        getProfileEmailSnapshot(supabase, authUser.id),
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

      // Enforce onboarding whenever the profile does not yet include an email.
      if (!hasProfileEmail) {
        return "/onboarding";
      }

      if (requestedPath && requestedPath !== "/onboarding") {
        return requestedPath;
      }

      const hasProfileRow = !profileError && Boolean(profileRow?.id);
      const hasProfileDetails = Boolean(
        String(profileRow?.display_name ?? "").trim()
          || String(profileRow?.university_uid ?? "").trim(),
      );
      const hasPrograms = !programError && (programCount ?? 0) > 0;
      const isExistingUser = hasProfileRow && (hasProfileDetails || hasPrograms);

      return isExistingUser ? "/dashboard" : "/onboarding";
    };

    const navigateAfterAuth = async (authUser: {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown>;
    }) => {
      if (authNavigationStarted.current) return;
      authNavigationStarted.current = true;
      try {
        await ensureProfile(authUser);
        const destination = await resolvePostAuthPath(authUser, nextPath);
        sessionStorage.removeItem(AUTH_FLOW_KEY);
        if (active) {
          navigate(destination, { replace: true });
        }
      } finally {
        if (active) {
          authNavigationStarted.current = false;
        }
      }
    };

    const finishEmailCallbackSignIn = async () => {
      const hashParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.hash.replace(/^#/, ""))
          : new URLSearchParams();

      const callbackError =
        searchParams.get("error_description")
        ?? hashParams.get("error_description")
        ?? searchParams.get("error")
        ?? hashParams.get("error");

      if (callbackError) {
        throw new Error(callbackError);
      }

      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
        return;
      }

      const tokenHash = searchParams.get("token_hash") ?? hashParams.get("token_hash");
      const callbackType = searchParams.get("type") ?? hashParams.get("type");
      if (tokenHash && callbackType) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: callbackType as any,
        });
        if (verifyError) {
          throw verifyError;
        }
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setSessionError) {
          throw setSessionError;
        }
      }
    };

    const run = async () => {
      if (isAuthCallback) {
        try {
          await finishEmailCallbackSignIn();
        } catch (callbackError) {
          if (!active) return;
          sessionStorage.removeItem(AUTH_FLOW_KEY);
          setError(
            callbackError instanceof Error
              ? callbackError.message
              : "Unable to finish sign-in. Request a new email link.",
          );
          setLoading(false);
        }
      }

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

  const showForgotHelp = () => {
    setError(null);
    setMessage("Enter your email and choose Sign in to OrbitUMD to receive a new sign-in link.");
  };

  return (
    <div className="signin-template">
      <div className="shell">
        <div className="left">
          <button
            className="left-logo"
            onClick={() => navigate("/")}
            type="button"
            aria-label="Back to home"
          >
            
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="#EF5350" strokeWidth="2" />
              <circle cx="19" cy="5" r="2" stroke="#EF5350" strokeWidth="2" />
              <circle cx="5" cy="19" r="2" stroke="#EF5350" strokeWidth="2" />
              <path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" stroke="#EF5350" strokeWidth="2" stroke-dasharray="3 2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" stroke="#EF5350" strokeWidth="2" stroke-dasharray="3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="left-logo-text">Orbit<span>UMD</span></span>
          </button>

          <div className="orbit-stage" aria-hidden="true">
            <div className="orbit-ring o1"><div className="orbit-dot"></div></div>
            <div className="orbit-ring o2"><div className="orbit-dot"></div></div>
            <div className="orbit-ring o3"><div className="orbit-dot"></div></div>
            <div className="orbit-center">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <circle cx="13" cy="13" r="3" fill="#EF5350"/>
                <circle cx="13" cy="13" r="7" stroke="#EF5350" strokeWidth="1" strokeDasharray="2.5 2"/>
              </svg>
            </div>
          </div>

          <div className="left-bottom">
            <h2 className="left-headline">
              Your degree,<br />
              finally <em>under<br />control.</em>
            </h2>
            <p className="left-sub">
              OrbitUMD maps every credit, requirement, and semester so nothing slips through the cracks before graduation.
            </p>
            <div className="testimonial">
              <p>"OrbitUMD helped me navigate my degree requirements with clarity and confidence."</p>
              <div className="testimonial-author">
                <div className="t-avatar">UM</div>
                <span className="t-name">A UMD Student</span>
              </div>
            </div>
          </div>
        </div>

        <div className="right">
          <div className="form-wrap">
            <div className="form-eyebrow">
              <div className="eyebrow-line"></div>
              <span className="eyebrow-text">University of Maryland</span>
            </div>

            <h1 className="form-title">Welcome back.</h1>
            <p className="form-desc">Sign in to continue planning your four years at UMD.</p>

            <div className="sso-stack">
              <button
                className="sso-btn"
                onClick={() => void handleOAuth("google")}
                disabled={loading}
                type="button"
                aria-label="Continue with Google"
              >
                <svg className="sso-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21.35 11.1h-9.18v2.96h5.27c-.23 1.5-1.71 4.4-5.27 4.4-3.17 0-5.75-2.62-5.75-5.84s2.58-5.84 5.75-5.84c1.8 0 3 .77 3.69 1.43l2.52-2.44C16.9 4.4 14.83 3.5 12.17 3.5 7.22 3.5 3.2 7.56 3.2 12.62s4.02 9.12 8.97 9.12c5.18 0 8.6-3.65 8.6-8.78 0-.59-.06-1.04-.17-1.48z" fill="#4285F4"/>
                </svg>
                Continue with Google
              </button>
              <button
                className="sso-btn"
                onClick={() => void handleOAuth("apple")}
                disabled={loading}
                type="button"
                aria-label="Continue with Apple"
              >
                <svg className="sso-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.3 12.3c0-2 1.6-3 1.7-3.1-.9-1.3-2.3-1.5-2.8-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.4-.7-2.4-.7-1.3 0-2.4.7-3.1 1.9-1.3 2.2-.3 5.2.9 6.9.6 1 1.3 2 2.3 2 .9 0 1.4-.6 2.7-1 .9-.3 1.8-.3 2.7 0 .6.2 1.1.5 1.7.5 1 0 1.7-1 2.3-2 .7-1 .9-2 .9-2-.1 0-2-.8-2-2.6zm-1.8-6.7c.4-.5.8-1.3.7-2.1-.6 0-1.3.4-1.8.9-.4.4-.8 1.2-.7 1.9.7.1 1.4-.3 1.8-.7z"/>
                </svg>
                Continue with Apple
              </button>
            </div>

            <div className="divider">
              <div className="divider-line"></div>
              <span className="divider-text">or sign in with email</span>
              <div className="divider-line"></div>
            </div>

            <div className="field">
              <label htmlFor="email">University Email</label>
              <div className="field-wrap">
                <input
                  id="email"
                  type="email"
                  placeholder="username@umd.edu"
                  autoComplete="email"
                  value={email}
                  disabled={loading}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && email.trim() && !loading) {
                      void handleEmailSignIn();
                    }
                  }}
                />
                <svg className="field-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1.5 5.5l6.5 4 6.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <div className="options-row">
              <label className="remember">
                <input type="checkbox" defaultChecked />
                <span>Remember me</span>
              </label>
              <button className="forgot" onClick={showForgotHelp} type="button">
                Forgot password?
              </button>
            </div>

            <button
              className="submit-btn"
              onClick={() => void handleEmailSignIn()}
              disabled={loading || !email.trim()}
              type="button"
            >
              {loading ? "Signing in..." : "Sign in to OrbitUMD"}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M10 5l3 3-3 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {message && <div className="signin-message success">{message}</div>}
            {error && <div className="signin-message error">{error}</div>}

            <div className="register-row">
              New to OrbitUMD?{" "}
              <button
                className="register-link"
                onClick={() => setMessage("Use your UMD email above and we will create your account automatically.")}
                type="button"
              >
                Create your plan →
              </button>
            </div>

            <div className="form-footer">
              <p>
                By signing in, you agree to OrbitUMD&apos;s{" "}
                <button type="button" className="legal-link" onClick={() => setOpenLegalModal("terms")}>terms</button>
                {" "}and{" "}
                <button type="button" className="legal-link" onClick={() => setOpenLegalModal("privacy")}>privacy policy</button>
                .
                <br />
                Your UMD credentials are never stored by OrbitUMD.
              </p>
            </div>
          </div>
        </div>
      </div>

      {openLegalModal && (
        <div
          className="legal-modal-backdrop"
          role="presentation"
          onClick={() => setOpenLegalModal(null)}
        >
          <div
            className="legal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="legal-modal-header">
              <h3 id="legal-modal-title">
                {openLegalModal === "terms" ? "OrbitUMD Terms" : "OrbitUMD Privacy Policy"}
              </h3>
              <button
                type="button"
                className="legal-close"
                onClick={() => setOpenLegalModal(null)}
                aria-label="Close legal dialog"
              >
                ×
              </button>
            </div>
            {openLegalModal === "terms" ? (
              <div className="legal-modal-body">
                <p>
                  OrbitUMD is provided for academic planning support. You are responsible for verifying all registration,
                  prerequisite, and graduation requirements against official University of Maryland sources.
                </p>
                <p>
                  Use of OrbitUMD is subject to responsible and lawful usage. Misuse, abuse, scraping, or attempts to
                  interfere with service operation may result in revoked access.
                </p>
                <p>
                  OrbitUMD does not guarantee seat availability, section timing stability, or administrative approvals.
                  Always confirm final decisions with official advisors and systems before enrollment.
                </p>
              </div>
            ) : (
              <div className="legal-modal-body">
                <p>
                  OrbitUMD stores only the data needed to power your planning experience, such as profile details,
                  selected programs, schedules, and onboarding inputs.
                </p>
                <p>
                  Authentication is handled by Supabase. OrbitUMD does not store your UMD account password or raw login
                  credentials.
                </p>
                <p>
                  You can request deletion of your account data by contacting support. Operational logs may be retained
                  briefly for security and reliability purposes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
