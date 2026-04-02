/**
 * Demo Mode utility — a single localStorage flag controls the entire demo experience.
 * Repositories and auth check isDemoMode() before hitting Supabase, returning
 * static demo data instead. No real network requests are made in demo mode.
 */

const DEMO_MODE_KEY = "orbitumd:demo-mode";

/** Synthetic user id that never collides with real Supabase UUIDs. */
export const DEMO_USER_ID = "00000000-0000-0000-0000-demo00000001";

export function buildAppUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${base}${normalizedPath}`;
}

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function enableDemoMode(): void {
  try {
    localStorage.setItem(DEMO_MODE_KEY, "true");
  } catch {
    // noop — demo just won't persist across reloads
  }
}

export function disableDemoMode(): void {
  try {
    localStorage.removeItem(DEMO_MODE_KEY);
  } catch {
    // noop
  }
}
