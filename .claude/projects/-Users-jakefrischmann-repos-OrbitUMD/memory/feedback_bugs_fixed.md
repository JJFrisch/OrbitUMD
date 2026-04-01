---
name: Bugs fixed in great-williams session
description: Concrete bugs found and fixed during the great-williams worktree session
type: feedback
---

Fixes applied in the `claude/great-williams` branch:

1. **Dashboard banners show during loading** — `completedTermsMissingGrades` and `primarySuggestion` action-prompt banners were rendered outside the `!loading` guard, causing "Set up your first MAIN schedule" to flash for every user while data was fetching. Added `!loading &&` to both banners.

2. **Sidebar hardcoded "Student" display name** — `const userDisplay = "Student"` replaced with a `useEffect` that calls `supabase.auth.getUser()` + optional `user_profiles` table lookup, with `onAuthStateChange` subscription for live updates.

3. **Sidebar hardcoded "8" badge** — `badge: "8"` on "My Schedules" nav item removed (it was fake static data).

4. **Suggestions "Details" button** — Previously just showed a toast. Now navigates to `/schedule-builder?search=<code>`.

5. **Suggestions "+ Add to plan" button** — Previously only marked locally with no real action. Now navigates to schedule builder with the course pre-searched.

6. **CoursePlannerPage: `?search=` query param** — Added handler for `searchParams.get("search")` that calls `setSearchInput` + `executeSearch`, so Suggestions deeplinks work.

7. **Settings admin password in plaintext** — `const ADMIN_UNLOCK_PASSWORD = "qim*fu2"` changed to `import.meta.env.VITE_ADMIN_UNLOCK_PASSWORD ?? ""`.

8. **FourYearPlan progress-strip shows zeroes while loading** — Wrapped progress-strip content with `loading ? <loading placeholder> : <actual values>` to prevent "0 cr / 120 cr" flash.

**Why:** All were either visible bugs during a demo or incorrect data shown to users.
**How to apply:** Always check loading states before rendering data-derived UI; avoid hardcoded display values that should come from auth.
