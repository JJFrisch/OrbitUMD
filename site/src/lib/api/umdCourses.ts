import type {
  CourseSearchParams,
  DegreeRequirementRef,
  UmdCourseSummary,
  UmdSection,
  UmdSectionMeeting,
  UmdTerm,
} from "../types/course";
import { getSupabaseClient } from "../supabase/client";

const API_BASE = import.meta.env.VITE_UMD_API_BASE_URL ?? "https://api.umd.io/v1";

const CATALOG_TERMS_VIEW = "catalog_terms_v";
const CATALOG_COURSES_VIEW = "catalog_courses_v";
const CATALOG_SECTIONS_VIEW = "catalog_sections_v";
const CATALOG_MEETINGS_VIEW = "catalog_meetings_v";

type UmdApiCourse = {
  course_id: string;
  dept_id: string;
  semester?: string;
  credits: string;
  name: string;
  gen_ed?: Array<string | string[]>;
  description?: string;
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
    seasonCode === "01"
      ? "winter"
      : seasonCode === "03" || seasonCode === "05"
        ? "spring"
        : seasonCode === "06" || seasonCode === "08"
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

async function searchCoursesFromCatalog(params: CourseSearchParams): Promise<UmdCourseSummary[]> {
  const supabase = getSupabaseClient();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 100;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const normalizedQuery = params.query?.trim().toUpperCase();
  const deptFromQuery = params.query?.trim().toUpperCase().match(/^([A-Z]{2,4})\s*\d*/)?.[1];
  const deptFilter = params.deptId ?? deptFromQuery;
  const { year, termCode } = splitTermCode(params.termCode);

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
  const { year, termCode: seasonCode } = splitTermCode(termCode);

  const { data: sectionData, error: sectionError } = await supabase
    .from(CATALOG_SECTIONS_VIEW)
    .select("section_key, course_code, section_code, instructor, open_seats, total_seats")
    .eq("year", year)
    .eq("term_code", seasonCode)
    .eq("course_code", courseId)
    .order("section_code", { ascending: true });

  if (sectionError) {
    throw sectionError;
  }

  const sections = (sectionData ?? []) as CatalogSectionRow[];
  if (sections.length === 0) {
    return [];
  }

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
