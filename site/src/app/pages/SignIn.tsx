import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useTheme } from "../contexts/ThemeContext";

function buildAppRedirectUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${base}${normalizedPath}`;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const supabase = getSupabaseClient();
  const { theme, toggleTheme } = useTheme();
  const nextPath = searchParams.get("next") || "/dashboard";
  const isAuthCallback = ["code", "access_token", "refresh_token", "token_hash", "type", "error_description"]
    .some((key) => searchParams.has(key));

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    const run = async () => {
      if (!isAuthCallback) {
        // Enforce explicit re-auth whenever the sign-in screen is opened directly.
        await supabase.auth.signOut({ scope: "local" });
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.user) {
        await ensureProfile();
        navigate(nextPath, { replace: true });
      }
    };

    void run();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        void ensureProfile().finally(() => {
          if (active) {
            navigate(nextPath, { replace: true });
          }
        });
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
      const msg = err instanceof Error ? err.message : `Unable to sign in with ${provider}.`;
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="fixed top-4 right-4">
        <Button type="button" variant="outline" size="sm" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="w-4 h-4 mr-1" /> : <Moon className="w-4 h-4 mr-1" />}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to OrbitUMD</CardTitle>
          <CardDescription>Use email, Google, or Apple.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-muted-foreground">Email</label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@umd.edu"
            />
            <Button
              className="w-full"
              onClick={handleEmailSignIn}
              disabled={loading || !email.trim()}
            >
              Continue With Email
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void handleOAuth("google")} disabled={loading}>
              Continue With Google
            </Button>
            <Button variant="outline" onClick={() => void handleOAuth("apple")} disabled={loading}>
              Continue With Apple
            </Button>
          </div>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
