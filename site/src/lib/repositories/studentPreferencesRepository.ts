import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo/demoMode";

// ── Types ──

export type WorkloadTolerance = "light" | "moderate" | "heavy";

export interface StudentPreferences {
  interestAreas: string[];
  workloadTolerance: WorkloadTolerance;
  preferredCourseFormats: string[];
  noMorningsBefore: string | null;
  noEveningsAfter: string | null;
  avoidDays: string[];
  updatedAt: string;
}

const DEFAULT_PREFERENCES: StudentPreferences = {
  interestAreas: [],
  workloadTolerance: "moderate",
  preferredCourseFormats: [],
  noMorningsBefore: null,
  noEveningsAfter: null,
  avoidDays: [],
  updatedAt: new Date().toISOString(),
};

// ── Interest areas available for selection ──

export const INTEREST_AREA_OPTIONS: string[] = [
  "Artificial Intelligence / ML",
  "Biology / Life Sciences",
  "Business / Entrepreneurship",
  "Chemistry",
  "Communication",
  "Computer Science / Software",
  "Creative Arts / Design",
  "Cybersecurity",
  "Data Science / Analytics",
  "Economics / Finance",
  "Education",
  "Engineering",
  "Environmental Science",
  "Film / Media",
  "Health / Pre-Med",
  "History",
  "Information Science",
  "Journalism",
  "Law / Pre-Law",
  "Linguistics",
  "Literature / Writing",
  "Mathematics / Statistics",
  "Music",
  "Philosophy",
  "Physics / Astronomy",
  "Political Science / Policy",
  "Psychology",
  "Public Health",
  "Sociology / Anthropology",
  "Theater / Performance",
];

export const COURSE_FORMAT_OPTIONS: string[] = [
  "In-person",
  "Online synchronous",
  "Online asynchronous",
  "Hybrid",
];

// ── Keyword mapping for interest-to-department matching ──

export const INTEREST_DEPARTMENT_MAP: Record<string, string[]> = {
  "Artificial Intelligence / ML": ["CMSC", "INST", "MATH", "STAT"],
  "Biology / Life Sciences": ["BSCI", "BIOL", "BCHM", "CBMG"],
  "Business / Entrepreneurship": ["BMGT", "BUDT", "BUFN", "BUSI", "ENTS"],
  "Chemistry": ["CHEM"],
  "Communication": ["COMM"],
  "Computer Science / Software": ["CMSC", "INST"],
  "Creative Arts / Design": ["ARTT", "ARTH", "ARCH"],
  "Cybersecurity": ["CMSC", "HACS"],
  "Data Science / Analytics": ["CMSC", "INST", "STAT", "DATA"],
  "Economics / Finance": ["ECON", "BUFN"],
  "Education": ["EDUC", "TLPL", "EDSP"],
  "Engineering": ["ENME", "ENCE", "ENEE", "ENMA", "BIOE", "CHBE", "ENES"],
  "Environmental Science": ["ENST", "GEOG", "GEOL"],
  "Film / Media": ["FILM", "JOUR"],
  "Health / Pre-Med": ["BSCI", "CHEM", "KNES", "PHYS", "HLTH"],
  "History": ["HIST"],
  "Information Science": ["INST"],
  "Journalism": ["JOUR"],
  "Law / Pre-Law": ["GVPT", "PHIL", "CCJS"],
  "Linguistics": ["LING"],
  "Literature / Writing": ["ENGL"],
  "Mathematics / Statistics": ["MATH", "STAT", "AMSC"],
  "Music": ["MUSC", "MUED"],
  "Philosophy": ["PHIL"],
  "Physics / Astronomy": ["PHYS", "ASTR"],
  "Political Science / Policy": ["GVPT", "PLCY"],
  "Psychology": ["PSYC"],
  "Public Health": ["HLTH", "EPIB", "HLSA"],
  "Sociology / Anthropology": ["SOCY", "ANTH"],
  "Theater / Performance": ["THET"],
};

// ── Local storage persistence ──

const LOCAL_PREFERENCES_KEY = "orbitumd-student-preferences";

function readLocalPreferences(): StudentPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudentPreferences;
  } catch {
    return null;
  }
}

function writeLocalPreferences(prefs: StudentPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(prefs));
}

// ── Demo data ──

const DEMO_PREFERENCES: StudentPreferences = {
  interestAreas: ["Computer Science / Software", "Artificial Intelligence / ML", "Data Science / Analytics"],
  workloadTolerance: "moderate",
  preferredCourseFormats: ["In-person"],
  noMorningsBefore: "09:00",
  noEveningsAfter: null,
  avoidDays: [],
  updatedAt: "2026-03-15T00:00:00Z",
};

// ── Public API ──

export async function loadStudentPreferences(): Promise<StudentPreferences> {
  if (isDemoMode()) return DEMO_PREFERENCES;

  // Try local first (always available)
  const local = readLocalPreferences();

  // Try Supabase if authenticated
  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("recommendation_preferences")
      .eq("id", userId)
      .single();

    if (!error && data?.recommendation_preferences) {
      const remote = data.recommendation_preferences as StudentPreferences;
      // Sync local with remote
      writeLocalPreferences(remote);
      return { ...DEFAULT_PREFERENCES, ...remote };
    }
  } catch {
    // Not authenticated or DB unavailable — fall through to local
  }

  return local ? { ...DEFAULT_PREFERENCES, ...local } : DEFAULT_PREFERENCES;
}

export async function saveStudentPreferences(prefs: StudentPreferences): Promise<void> {
  const withTimestamp = { ...prefs, updatedAt: new Date().toISOString() };

  // Always persist locally
  writeLocalPreferences(withTimestamp);

  // Try to persist to Supabase
  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();

    await supabase
      .from("user_profiles")
      .update({ recommendation_preferences: withTimestamp })
      .eq("id", userId);
  } catch {
    // Local-only save is fine
  }
}

/**
 * Given a student's interest areas, return the set of department codes
 * that are relevant for elective/interest scoring.
 */
export function getInterestedDepartments(interestAreas: string[]): Set<string> {
  const depts = new Set<string>();
  for (const area of interestAreas) {
    for (const dept of INTEREST_DEPARTMENT_MAP[area] ?? []) {
      depts.add(dept);
    }
  }
  return depts;
}
