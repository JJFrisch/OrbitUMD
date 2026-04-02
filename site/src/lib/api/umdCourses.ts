import type {
  CourseSearchParams,
  DegreeRequirementRef,
  UmdCourseSummary,
  UmdSection,
  UmdSectionMeeting,
  UmdTerm,
} from "../types/course";
import { isDemoMode } from "../demo/demoMode";
import { getSupabaseClient } from "../supabase/client";

const API_BASE = import.meta.env.VITE_UMD_API_BASE_URL ?? "https://api.umd.io/v1";

const CATALOG_TERMS_VIEW = "catalog_terms_v";
const CATALOG_COURSES_VIEW = "catalog_courses_v";
const CATALOG_SECTIONS_VIEW = "catalog_sections_v";
const CATALOG_MEETINGS_VIEW = "catalog_meetings_v";
const catalogTermResolutionCache = new Map<string, { year: number; termCode: string }>();

type UmdApiCourse = {
  course_id: string;
  dept_id: string;
  semester?: string;
  credits: string;
  name: string;
  gen_ed?: Array<string | string[]>;
  description?: string;
  relationships?: {
    prereqs?: string;
  };
};

type UmdApiSection = {
  section_id: string;
  course: string;
  number?: string;
  semester?: string;
  instructor?: string;
  instructors?: string[];
  seats?: string;
  open_seats?: string;
  meetings?: Array<{
    days: string;
    start_time: string;
    end_time: string;
    building?: string;
    room?: string;
  }>;
};

type CatalogTermRow = {
  term_code: string;
  year: number;
  label: string;
  active: boolean;
};

type CatalogCourseRow = {
  course_code: string;
  dept_id: string | null;
  name: string;
  credits: number | null;
  max_credits: number | null;
  geneds: string[] | null;
  description: string | null;
};

type CatalogSearchRow = {
  course_code: string;
  term_code: string;
  year: number;
  name: string;
  dept_id: string;
  credits: number | null;
  min_credits: number | null;
  max_credits: number | null;
  geneds: string[] | null;
  description: string | null;
  rank: number | null;
};

type CatalogSearchSeedRow = {
  course_code: string;
  term_code: string;
  year: number;
  name: string;
  dept_id: string;
  credits: number | null;
  min_credits: number | null;
  max_credits: number | null;
  geneds: string[] | null;
  description: string | null;
  search_text: string;
  source_fingerprint: string;
  updated_at: string;
};

type CatalogSyncStateRow = {
  sync_run_id: number;
  catalog_version: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
};

type CatalogSectionRow = {
  section_key: string;
  course_code: string;
  section_code: string;
  instructor: string | null;
  open_seats: number | null;
  total_seats: number | null;
};

type CatalogMeetingRow = {
  section_key: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  location: string | null;
};

type DemoSelection = {
  course?: {
    id?: string;
    courseCode?: string;
    name?: string;
    deptId?: string;
    credits?: number;
    minCredits?: number;
    maxCredits?: number;
    description?: string;
    genEds?: string[];
    term?: string;
    year?: number;
    sections?: Array<{
      id?: string;
      courseCode?: string;
      sectionCode?: string;
      instructor?: string;
      instructors?: string[];
      totalSeats?: number;
      openSeats?: number;
      meetings?: Array<{
        days?: string;
        startTime?: string;
        endTime?: string;
        location?: string;
      }>;
    }>;
  };
  section?: {
    id?: string;
    sectionCode?: string;
    instructor?: string;
    instructors?: string[];
    totalSeats?: number;
    openSeats?: number;
    meetings?: Array<{
      days?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
    }>;
  };
};

type DemoSchedule = {
  term_code?: string;
  term_year?: number;
  selections_json?: DemoSelection[];
};

async function loadDemoSchedules(): Promise<DemoSchedule[]> {
  const { DEMO_SCHEDULES } = await import("../demo/demoData");
  return DEMO_SCHEDULES as unknown as DemoSchedule[];
}

function demoTermToUmdTerm(termCode: string, termYear: number): UmdTerm {
  return parseTermCode(`${termYear}${termCode}`);
}

function mapDemoCourseSelection(selection: DemoSelection, schedule: DemoSchedule): UmdCourseSummary | null {
  const course = selection.course;
  if (!course?.courseCode) return null;

  return {
    id: course.courseCode,
    deptId: course.deptId ?? course.courseCode.slice(0, 4),
    number: course.courseCode.replace(/^[A-Z]+/, ""),
    title: course.name ?? course.courseCode,
    credits: Number(course.credits ?? course.maxCredits ?? course.minCredits ?? 0),
    genEdTags: Array.isArray(course.genEds) ? course.genEds : [],
    description: course.description,
  };
}

function mapDemoSectionToUmdSection(selection: DemoSelection, courseId: string, termCode: string): UmdSection | null {
  const section = selection.section;
  if (!section) return null;

  return {
    id: section.id ?? `${courseId}-${section.sectionCode ?? "TBA"}`,
    courseId,
    sectionCode: section.sectionCode ?? "TBA",
    termCode,
    instructor: section.instructor ?? section.instructors?.join(", ") ?? undefined,
    openSeats: section.openSeats ?? undefined,
    totalSeats: section.totalSeats ?? undefined,
    meetings: (section.meetings ?? []).map((meeting, index) => ({
      id: `${section.id ?? courseId}-${index}`,
      sectionId: section.id ?? `${courseId}-${section.sectionCode ?? "TBA"}`,
      days: parseDays(meeting.days ?? ""),
      startMinutes: parseTimeToMinutes(meeting.startTime ?? ""),
      endMinutes: parseTimeToMinutes(meeting.endTime ?? ""),
      location: meeting.location,
      instructor: section.instructor ?? undefined,
    })),
  };
}

function normalizeDemoQuery(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesDemoCourse(course: NonNullable<DemoSelection["course"]>, params: CourseSearchParams): boolean {
  const query = normalizeDemoQuery(params.query);
  const deptFilter = params.deptId?.trim().toUpperCase();
  const genEdTag = params.genEdTag?.trim().toUpperCase();
  const courseCode = String(course.courseCode ?? "").toUpperCase();
  const title = normalizeDemoQuery(course.name);
  const deptId = String(course.deptId ?? courseCode.slice(0, 4)).toUpperCase();
  const genEds = Array.isArray(course.genEds) ? course.genEds.map((tag) => String(tag).toUpperCase()) : [];

  if (deptFilter && deptId !== deptFilter) {
    return false;
  }

  if (genEdTag && !genEds.includes(genEdTag)) {
    return false;
  }

  if (!query) {
    return true;
  }

  return (
    courseCode.toLowerCase().includes(query) ||
    title.includes(query) ||
    deptId.toLowerCase().includes(query)
  );
}

async function getJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`UMD API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function parseTermCode(termCodeInput: string | number): UmdTerm {
  const termCode = String(termCodeInput);
  const year = Number(termCode.slice(0, 4));
  const seasonCode = termCode.slice(4);
  const season =
    seasonCode === "12"
      ? "winter"
      : seasonCode === "01"
        ? "spring"
        : seasonCode === "05"
          ? "summer"
          : "fall";

  const seasonLabel = season[0].toUpperCase() + season.slice(1);

  return {
    code: termCode,
    season,
    year,
    label: `${seasonLabel} ${year}`,
  };
}

function splitTermCode(termCode: string): { year: number; termCode: string } {
  return {
    year: Number(termCode.slice(0, 4)),
    termCode: termCode.slice(4),
  };
}

function hasSupabaseCatalogConfig(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function parseCredits(rawCredits: string): number {
  const asNumber = Number(rawCredits);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  const split = rawCredits.split("-").map((value) => Number(value));
  if (split.length === 2 && split.every((value) => Number.isFinite(value))) {
    return split[1];
  }

  return 0;
}

function parseDays(raw: string): UmdSectionMeeting["days"] {
  const days: UmdSectionMeeting["days"] = [];
  let i = 0;

  while (i < raw.length) {
    if (raw.slice(i, i + 2) === "Tu") {
      days.push("Tu");
      i += 2;
      continue;
    }

    if (raw.slice(i, i + 2) === "Th") {
      days.push("Th");
      i += 2;
      continue;
    }

    const day = raw[i];
    if (day === "M" || day === "W" || day === "F") {
      days.push(day);
    }
    i += 1;
  }

  return days;
}

function parseTimeToMinutes(raw: string): number {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!match) {
    return 0;
  }

  const [, hourPart, minutePart, suffix] = match;
  let hour = Number(hourPart);
  const minute = Number(minutePart);

  if (suffix === "am") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  return hour * 60 + minute;
}

function parseSeats(raw?: string, rawOpenSeats?: string): { openSeats?: number; totalSeats?: number } {
  if (!raw && !rawOpenSeats) {
    return {};
  }

  const total = Number(raw);
  const open = Number(rawOpenSeats);

  return {
    openSeats: Number.isFinite(open) ? open : undefined,
    totalSeats: Number.isFinite(total) ? total : undefined,
  };
}

function flattenGenEds(rawGenEds?: Array<string | string[]>): string[] {
  if (!rawGenEds) {
    return [];
  }

  return rawGenEds.flatMap((entry) => (Array.isArray(entry) ? entry : [entry])).filter(Boolean);
}

async function fetchTermsFromCatalog(): Promise<UmdTerm[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(CATALOG_TERMS_VIEW)
    .select("term_code, year, label, active")
    .eq("active", true)
    .order("year", { ascending: false })
    .order("term_code", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as CatalogTermRow[];
  return rows.map((row) => ({
    ...parseTermCode(`${row.year}${row.term_code}`),
    label: row.label,
  }));
}

async function fetchDemoTerms(): Promise<UmdTerm[]> {
  const schedules = await loadDemoSchedules();
  const byCode = new Map<string, UmdTerm>();

  for (const schedule of schedules) {
    if (!schedule.term_code || typeof schedule.term_year !== "number") continue;
    const term = demoTermToUmdTerm(schedule.term_code, schedule.term_year);
    byCode.set(term.code, term);
  }

  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

async function resolveCatalogTermWithFallback(termCodeInput: string): Promise<{ year: number; termCode: string }> {
  const cached = catalogTermResolutionCache.get(termCodeInput);
  if (cached) {
    return cached;
  }

  const { year, termCode } = splitTermCode(termCodeInput);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(CATALOG_TERMS_VIEW)
    .select("term_code, year")
    .eq("term_code", termCode)
    .lte("year", year)
    .order("year", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = (data ?? [])[0] as Pick<CatalogTermRow, "term_code" | "year"> | undefined;
  if (!row) {
    const fallback = { year, termCode };
    catalogTermResolutionCache.set(termCodeInput, fallback);
    return fallback;
  }

  const resolved = {
    year: row.year,
    termCode: row.term_code,
  };
  catalogTermResolutionCache.set(termCodeInput, resolved);
  return resolved;
}

function mapCatalogSearchRow(row: CatalogSearchRow): UmdCourseSummary {
  const [deptId, number = ""] = row.course_code.split(/(?=\d)/);

  return {
    id: row.course_code,
    deptId: row.dept_id ?? deptId ?? "",
    number,
    title: row.name,
    credits: Number(row.credits ?? row.max_credits ?? 0),
    genEdTags: row.geneds ?? [],
    description: row.description ?? undefined,
  };
}

export async function getCatalogSearchVersion(): Promise<string | null> {
  if (!hasSupabaseCatalogConfig()) {
    return null;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from("catalog_sync_state_v").select("catalog_version").limit(1);
    if (error) {
      throw error;
    }

    const row = (data ?? [])[0] as Pick<CatalogSyncStateRow, "catalog_version"> | undefined;
    return row?.catalog_version ?? null;
  } catch {
    return null;
  }
}

export async function loadCatalogSearchSeed(limitCount = 5000): Promise<CatalogSearchSeedRow[]> {
  if (!hasSupabaseCatalogConfig()) {
    return [];
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_catalog_search_seed", { limit_count: limitCount });
    if (error) {
      throw error;
    }

    return (data ?? []) as CatalogSearchSeedRow[];
  } catch {
    return [];
  }
}

export async function searchCatalogCoursesFromRpc(params: {
  query?: string;
  termCode?: string | null;
  deptId?: string;
  genEdTag?: string;
  limitCount?: number;
}): Promise<UmdCourseSummary[]> {
  if (!hasSupabaseCatalogConfig()) {
    return [];
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("search_catalog_courses", {
      query: params.query ?? null,
      term_code: params.termCode ?? null,
      dept_id: params.deptId ?? null,
      gen_ed_tag: params.genEdTag ?? null,
      limit_count: params.limitCount ?? 20,
    });

    if (error) {
      throw error;
    }

    return ((data ?? []) as CatalogSearchRow[]).map(mapCatalogSearchRow);
  } catch {
    return [];
  }
}

async function searchCoursesFromCatalog(params: CourseSearchParams): Promise<UmdCourseSummary[]> {
  const supabase = getSupabaseClient();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 100;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const normalizedQuery = params.query?.trim().toUpperCase();
  const deptFromQuery = params.query?.trim().toUpperCase().match(/^([A-Z]{2,4})\s*\d*/)?.[1];
  const deptFilter = params.deptId ?? deptFromQuery;
  const { year, termCode } = await resolveCatalogTermWithFallback(params.termCode);

  if (hasSupabaseCatalogConfig()) {
    const indexedRows = await searchCatalogCoursesFromRpc({
      query: params.query,
      termCode: `${year}${termCode}`,
      deptId: deptFilter,
      genEdTag: params.genEdTag,
      limitCount: pageSize,
    });

    if (indexedRows.length > 0) {
      return indexedRows;
    }
  }

  let query = supabase
    .from(CATALOG_COURSES_VIEW)
    .select("course_code, dept_id, name, credits, max_credits, geneds, description")
    .eq("year", year)
    .eq("term_code", termCode)
    .order("course_code", { ascending: true })
    .range(from, to);

  if (deptFilter) {
    query = query.eq("dept_id", deptFilter);
  }

  if (params.genEdTag) {
    query = query.contains("geneds", [params.genEdTag]);
  }

  if (normalizedQuery) {
    const escaped = normalizedQuery.replace(/,/g, "");
    query = query.or(`course_code.ilike.%${escaped}%,name.ilike.%${escaped}%,dept_id.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data ?? []) as CatalogCourseRow[]).map((course) => {
    const [deptId, number = ""] = course.course_code.split(/(?=\d)/);
    return {
      id: course.course_code,
      deptId: course.dept_id ?? deptId ?? "",
      number,
      title: course.name,
      credits: Number(course.credits ?? course.max_credits ?? 0),
      genEdTags: course.geneds ?? [],
      description: course.description ?? undefined,
    };
  });
}

async function fetchCourseSectionsFromCatalog(termCode: string, courseId: string): Promise<UmdSection[]> {
  const supabase = getSupabaseClient();
  const resolved = await resolveCatalogTermWithFallback(termCode);

  const { data: sectionData, error: sectionError } = await supabase
    .from(CATALOG_SECTIONS_VIEW)
    .select("section_key, course_code, section_code, instructor, open_seats, total_seats")
    .eq("year", resolved.year)
    .eq("term_code", resolved.termCode)
    .eq("course_code", courseId)
    .order("section_code", { ascending: true });

  if (sectionError) {
    throw sectionError;
  }

  const rawSections = (sectionData ?? []) as CatalogSectionRow[];
  if (rawSections.length === 0) {
    return [];
  }

  // Defensive dedupe: some view definitions can surface repeated rows per section key.
  const sectionsByKey = new Map<string, CatalogSectionRow>();
  for (const section of rawSections) {
    const existing = sectionsByKey.get(section.section_key);
    if (!existing) {
      sectionsByKey.set(section.section_key, section);
      continue;
    }

    sectionsByKey.set(section.section_key, {
      ...existing,
      open_seats: Math.max(existing.open_seats ?? 0, section.open_seats ?? 0),
      total_seats: Math.max(existing.total_seats ?? 0, section.total_seats ?? 0),
      instructor: existing.instructor ?? section.instructor,
    });
  }
  const sections = Array.from(sectionsByKey.values());

  const sectionKeys = sections.map((section) => section.section_key);
  const { data: meetingData, error: meetingError } = await supabase
    .from(CATALOG_MEETINGS_VIEW)
    .select("section_key, days, start_time, end_time, building, room, location")
    .in("section_key", sectionKeys);

  if (meetingError) {
    throw meetingError;
  }

  const meetingsBySection = new Map<string, CatalogMeetingRow[]>();
  for (const row of (meetingData ?? []) as CatalogMeetingRow[]) {
    const existing = meetingsBySection.get(row.section_key) ?? [];
    existing.push(row);
    meetingsBySection.set(row.section_key, existing);
  }

  return sections.map((section) => {
    const meetings = (meetingsBySection.get(section.section_key) ?? []).map((meeting, index) => ({
      id: `${section.section_key}-${index}`,
      sectionId: section.section_key,
      days: parseDays(meeting.days ?? ""),
      startMinutes: parseTimeToMinutes(meeting.start_time ?? ""),
      endMinutes: parseTimeToMinutes(meeting.end_time ?? ""),
      location:
        meeting.location ??
        (meeting.building && meeting.room ? `${meeting.building} ${meeting.room}` : meeting.room ?? undefined),
      instructor: section.instructor ?? undefined,
    }));

    return {
      id: section.section_key,
      courseId: section.course_code,
      sectionCode: section.section_code,
      termCode,
      instructor: section.instructor ?? undefined,
      openSeats: section.open_seats ?? undefined,
      totalSeats: section.total_seats ?? undefined,
      meetings,
    };
  });
}

export async function fetchTerms(): Promise<UmdTerm[]> {
  if (isDemoMode()) {
    return fetchDemoTerms();
  }

  if (hasSupabaseCatalogConfig()) {
    try {
      const terms = await fetchTermsFromCatalog();
      if (terms.length > 0) {
        return terms;
      }
    } catch {
      // Fall back to UMD API if catalog views are not present yet.
    }
  }

  const terms = await getJson<Array<string | number>>("courses/semesters");
  return terms.map(parseTermCode).sort((a, b) => a.code.localeCompare(b.code));
}

export async function searchCourses(params: CourseSearchParams): Promise<UmdCourseSummary[]> {
  if (isDemoMode()) {
    const schedules = await loadDemoSchedules();
    const selectedTermCode = String(params.termCode ?? "");
    const [selectedYearText, selectedSeasonCode = ""] = selectedTermCode.match(/^(\d{4})(\d{2})$/)?.slice(1) ?? [];
    const selectedYear = Number(selectedYearText);
    const selectedTerm = Number.isFinite(selectedYear) ? { termCode: selectedSeasonCode, termYear: selectedYear } : null;
    const results = new Map<string, UmdCourseSummary>();

    for (const schedule of schedules) {
      if (!schedule.term_code || typeof schedule.term_year !== "number") continue;
      if (selectedTerm && (schedule.term_code !== selectedTerm.termCode || schedule.term_year !== selectedTerm.termYear)) {
        continue;
      }

      const selections = Array.isArray(schedule.selections_json) ? schedule.selections_json : [];
      for (const selection of selections) {
        const summary = mapDemoCourseSelection(selection, schedule);
        if (!summary || !matchesDemoCourse(selection.course ?? {}, params)) continue;
        results.set(summary.id.toUpperCase(), summary);
      }
    }

    const rows = Array.from(results.values()).sort((a, b) => a.id.localeCompare(b.id));
    const pageSize = params.pageSize ?? 100;
    const from = ((params.page ?? 1) - 1) * pageSize;
    return rows.slice(from, from + pageSize);
  }

  if (hasSupabaseCatalogConfig()) {
    try {
      const rows = await searchCoursesFromCatalog(params);
      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Fall back to UMD API if catalog views are unavailable.
    }
  }

  const pageSize = params.pageSize ?? 100;
  const maxPages = params.query ? 10 : 1;
  const query = params.query?.trim().toLowerCase();
  const deptFromQueryMatch = params.query?.trim().toUpperCase().match(/^([A-Z]{2,4})\s*\d*/);
  const deptFromQuery = deptFromQueryMatch?.[1];
  const deptFilter = params.deptId ?? deptFromQuery;
  const allCourses: UmdApiCourse[] = [];

  for (let page = params.page ?? 1; page < (params.page ?? 1) + maxPages; page += 1) {
    const pageCourses = await getJson<UmdApiCourse[]>("courses", {
      semester: params.termCode,
      dept_id: deptFilter,
      page,
      per_page: pageSize,
    });

    if (pageCourses.length === 0) {
      break;
    }

    allCourses.push(...pageCourses);

    if (!query) {
      break;
    }
  }

  const mapped = allCourses.map((course) => {
    const [deptId, number = ""] = course.course_id.split(/(?=\d)/);

    return {
      id: course.course_id,
      deptId: deptId ?? course.dept_id,
      number,
      title: course.name,
      credits: parseCredits(course.credits),
      genEdTags: flattenGenEds(course.gen_ed),
      description: course.description,
      relationships: {
        prereqs: course.relationships?.prereqs,
      },
    };
  });

  return mapped.filter((course) => {
    if (deptFilter && course.deptId !== deptFilter) {
      return false;
    }

    if (params.genEdTag && !course.genEdTags.includes(params.genEdTag)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      course.id.toLowerCase().includes(query) ||
      course.title.toLowerCase().includes(query) ||
      course.deptId.toLowerCase().includes(query)
    );
  });
}

export async function fetchCourseSections(termCode: string, courseId: string): Promise<UmdSection[]> {
  if (isDemoMode()) {
    const schedules = await loadDemoSchedules();
    const byKey = new Map<string, UmdSection>();

    for (const schedule of schedules) {
      if (!schedule.term_code || typeof schedule.term_year !== "number") continue;
      if (`${schedule.term_year}${schedule.term_code}` !== termCode) continue;

      const selections = Array.isArray(schedule.selections_json) ? schedule.selections_json : [];
      for (const selection of selections) {
        const course = selection.course;
        if (!course?.courseCode || course.courseCode !== courseId) continue;
        const section = mapDemoSectionToUmdSection(selection, courseId, termCode);
        if (section) {
          byKey.set(section.sectionCode, section);
        }
      }
    }

    return Array.from(byKey.values()).sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  }

  if (hasSupabaseCatalogConfig()) {
    try {
      const rows = await fetchCourseSectionsFromCatalog(termCode, courseId);
      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Fall back to UMD API if catalog views are unavailable.
    }
  }

  const sections = await getJson<UmdApiSection[]>("courses/sections", {
    semester: termCode,
    course_id: courseId,
  });

  return sections.map((section) => {
    const seats = parseSeats(section.seats, section.open_seats);
    const instructor = section.instructor ?? section.instructors?.join(", ");

    return {
      id: section.section_id,
      courseId: section.course,
      sectionCode: section.number ?? section.section_id,
      termCode,
      instructor,
      openSeats: seats.openSeats,
      totalSeats: seats.totalSeats,
      meetings:
        section.meetings?.map((meeting, index) => ({
          id: `${section.section_id}-${index}`,
          sectionId: section.section_id,
          days: parseDays(meeting.days),
          startMinutes: parseTimeToMinutes(meeting.start_time),
          endMinutes: parseTimeToMinutes(meeting.end_time),
          location: meeting.building && meeting.room ? `${meeting.building} ${meeting.room}` : meeting.room,
          instructor,
        })) ?? [],
    };
  });
}

export async function fetchCourseById(termCode: string, courseId: string): Promise<UmdCourseSummary | null> {
  const courses = await searchCourses({ termCode, query: courseId, pageSize: 1 });
  return courses.find((course) => course.id === courseId) ?? null;
}

export async function fetchCourseRequirementRefs(_courseId: string): Promise<DegreeRequirementRef[]> {
  // This will be replaced with a Supabase-backed lookup when degree mappings are seeded.
  return [];
}

export async function fetchCourseRelationshipsFromUmdApi(
  termCode: string,
  courseId: string,
): Promise<{ prereqs?: string; description?: string } | null> {
  const normalizedCourseId = courseId.trim().toUpperCase();
  const deptId = normalizedCourseId.replace(/\d+.*/, "");
  if (!deptId) return null;

  try {
    const rows = await getJson<UmdApiCourse[]>("courses", {
      semester: termCode,
      dept_id: deptId,
      per_page: 300,
      page: 1,
    });
    const exact = rows.find((row) => String(row.course_id ?? "").toUpperCase() === normalizedCourseId);
    if (!exact) return null;

    return {
      prereqs: exact.relationships?.prereqs,
      description: exact.description,
    };
  } catch {
    return null;
  }
}
