import { CourseDataCache } from "./courseDataCache";
import { fetchCourseSections } from "@/lib/api/umdCourses";
import {
  EXACT_COURSE_CODE_REGEX,
  NUMBER_SEARCH_REGEX,
  extractDeptPrefix,
  fallbackTextMatch,
} from "../utils/formatting";
import type {
  Course,
  CourseSearchParams,
  Department,
  Meeting,
  Section,
} from "../types/coursePlanner";

const UMD_BASE = import.meta.env.VITE_UMD_API_BASE_URL ?? "https://api.umd.io/v1";
const JUPITER_BASE = import.meta.env.VITE_JUPITER_API_BASE_URL;
const SOURCE_MODE = (import.meta.env.VITE_COURSE_SOURCE_MODE ?? "auto") as "auto" | "umd" | "jupiter";

const searchCache = new CourseDataCache<Course[]>(20, 3 * 60 * 1000);
const deptCache = new CourseDataCache<Department[]>(1, 15 * 60 * 1000);
const instructorCache = new CourseDataCache<string[]>(5, 10 * 60 * 1000);

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function toCourse(raw: any, term: string, year: number): Course {
  const genEdRaw = Array.isArray(raw.gen_ed) ? raw.gen_ed : [];
  const genEds = genEdRaw.flatMap((value: string | string[]) => (Array.isArray(value) ? value : [value]));

  return {
    id: `${raw.course_id}-${raw.semester ?? `${year}${term}`}`,
    courseCode: raw.course_id,
    name: raw.name,
    deptId: raw.dept_id,
    credits: Number(raw.credits) || 0,
    description: raw.description,
    genEds,
    term,
    year,
  };
}

function toSection(raw: any): Section {
  const meetings: Meeting[] = (raw.meetings ?? []).map((meeting: any) => ({
    days: meeting.days ?? "",
    startTime: meeting.start_time,
    endTime: meeting.end_time,
    location: [meeting.building, meeting.room].filter(Boolean).join(" "),
    building: meeting.building,
    room: meeting.room,
    classtype: meeting.classtype,
  }));

  const instructors = Array.isArray(raw.instructors)
    ? raw.instructors
    : raw.instructor
      ? [raw.instructor]
      : [];

  return {
    id: raw.section_id,
    courseCode: raw.course,
    sectionCode: raw.number ?? raw.section_id,
    instructor: instructors.join(", "),
    instructors,
    totalSeats: Number(raw.seats) || 0,
    openSeats: Number(raw.open_seats) || 0,
    meetings,
  };
}

async function searchFromUmd(params: CourseSearchParams, signal?: AbortSignal): Promise<Course[]> {
  const departmentPrefix = extractDeptPrefix(params.normalizedInput);
  const pageLimit = params.normalizedInput ? 12 : 2;
  const all: Course[] = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    const url = new URL("courses", UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);
    url.searchParams.set("semester", `${params.year}${params.term}`);
    url.searchParams.set("per_page", "80");
    url.searchParams.set("page", String(page));
    if (departmentPrefix) {
      url.searchParams.set("dept_id", departmentPrefix);
    }

    const rows = await getJson<any[]>(url.toString(), signal);
    if (!rows.length) break;
    all.push(...rows.map((row) => toCourse(row, params.term, params.year)));
  }

  return applyClientFilters(all, params);
}

async function searchFromJupiter(params: CourseSearchParams, signal?: AbortSignal): Promise<Course[]> {
  if (!JUPITER_BASE) {
    throw new Error("Jupiter API URL not configured");
  }

  const url = new URL("/v0/courses/withSections", JUPITER_BASE);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  url.searchParams.set("term", params.term);
  url.searchParams.set("year", String(params.year));
  if (params.normalizedInput) {
    if (EXACT_COURSE_CODE_REGEX.test(params.normalizedInput)) {
      url.searchParams.set("courseCodes", params.normalizedInput);
    } else if (NUMBER_SEARCH_REGEX.test(params.normalizedInput)) {
      url.searchParams.set("number", params.normalizedInput);
    } else {
      const prefix = extractDeptPrefix(params.normalizedInput);
      if (prefix) {
        url.searchParams.set("prefix", prefix);
      }
    }
  }

  if (params.filters.genEds.length > 0) {
    url.searchParams.set("genEds", params.filters.genEds.join(","));
  }

  if (params.filters.instructor) {
    url.searchParams.set("instructor", params.filters.instructor);
  }

  if (params.filters.minCredits !== null || params.filters.maxCredits !== null) {
    const min = params.filters.minCredits ?? 0;
    const max = params.filters.maxCredits ?? 30;
    url.searchParams.set("credits", `${min}-${max}`);
  }

  url.searchParams.set("onlyOpen", String(params.filters.onlyOpen));
  url.searchParams.set("sortBy", "courseCode");

  const rows = await getJson<any[]>(url.toString(), signal);
  return applyClientFilters(rows.map((row) => toCourse(row, params.term, params.year)), params);
}

function applyClientFilters(courses: Course[], params: CourseSearchParams): Course[] {
  const query = params.normalizedInput;

  return courses.filter((course) => {
    if (params.filters.minCredits !== null && course.credits < params.filters.minCredits) return false;
    if (params.filters.maxCredits !== null && course.credits > params.filters.maxCredits) return false;

    if (params.filters.genEds.length > 0 && !params.filters.genEds.some((code) => course.genEds.includes(code))) {
      return false;
    }

    if (!query) return true;

    if (EXACT_COURSE_CODE_REGEX.test(query)) {
      return course.courseCode === query;
    }

    const prefix = extractDeptPrefix(query);
    if (prefix && query.length <= 4) {
      return course.courseCode.startsWith(prefix);
    }

    if (NUMBER_SEARCH_REGEX.test(query)) {
      return course.courseCode.slice(4).startsWith(query);
    }

    return fallbackTextMatch(course, query);
  });
}

export async function getDepartments(signal?: AbortSignal): Promise<Department[]> {
  return deptCache.getOrSet("departments", async () => {
    const url = new URL("courses/departments", UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);
    const rows = await getJson<any[]>(url.toString(), signal);
    return rows
      .map((row) => ({ code: row.dept_id ?? row.department_id ?? row.code, name: row.name ?? row.department }))
      .filter((row) => row.code && row.name)
      .sort((a, b) => a.code.localeCompare(b.code));
  });
}

export async function getActiveInstructors(term: string, year: number, signal?: AbortSignal): Promise<string[]> {
  return instructorCache.getOrSet(`${term}-${year}`, async () => {
    if (JUPITER_BASE) {
      const all: string[] = [];
      let offset = 0;
      const limit = 500;

      while (true) {
        const url = new URL("/v0/instructors/active", JUPITER_BASE);
        url.searchParams.set("term", term);
        url.searchParams.set("year", String(year));
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("limit", String(limit));

        const rows = await getJson<string[]>(url.toString(), signal).catch(() => []);
        if (!rows.length) break;
        all.push(...rows);
        if (rows.length < limit) break;
        offset += limit;
      }

      if (all.length > 0) {
        return Array.from(new Set(all)).sort();
      }
    }

    return [];
  });
}

export async function searchCoursesWithStrategy(
  params: CourseSearchParams,
  signal?: AbortSignal
): Promise<Course[]> {
  const cacheKey = JSON.stringify(params);

  return searchCache.getOrSet(cacheKey, async () => {
    if (SOURCE_MODE === "umd") {
      return searchFromUmd(params, signal);
    }

    if (SOURCE_MODE === "jupiter") {
      return searchFromJupiter(params, signal);
    }

    try {
      return await searchFromJupiter(params, signal);
    } catch {
      return searchFromUmd(params, signal);
    }
  });
}

export async function getSectionsForCourse(
  courseCode: string,
  term: string,
  year: number,
  signal?: AbortSignal
): Promise<Section[]> {
  if (JUPITER_BASE) {
    try {
      const url = new URL("/v0/courses/withSections", JUPITER_BASE);
      url.searchParams.set("courseCodes", courseCode);
      url.searchParams.set("term", term);
      url.searchParams.set("year", String(year));
      const rows = await getJson<any[]>(url.toString(), signal);
      const rawSections = rows[0]?.sections ?? [];
      if (rawSections.length) return rawSections.map(toSection);
    } catch {
      // fall through to UMD
    }
  }

  const rows = await fetchCourseSections(`${year}${term}`, courseCode);
  return rows.map((section) => ({
    id: section.id,
    courseCode: section.courseId,
    sectionCode: section.sectionCode,
    instructor: section.instructor ?? "",
    instructors: (section.instructor ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    totalSeats: section.totalSeats ?? 0,
    openSeats: section.openSeats ?? 0,
    meetings: section.meetings.map((meeting) => ({
      days: meeting.days.join(""),
      startTime: `${Math.floor(meeting.startMinutes / 60) % 12 || 12}:${String(meeting.startMinutes % 60).padStart(2, "0")}${meeting.startMinutes >= 12 * 60 ? "pm" : "am"}`,
      endTime: `${Math.floor(meeting.endMinutes / 60) % 12 || 12}:${String(meeting.endMinutes % 60).padStart(2, "0")}${meeting.endMinutes >= 12 * 60 ? "pm" : "am"}`,
      location: meeting.location,
    })),
  }));
}
