import { CourseDataCache } from "./courseDataCache";
import {
  EXACT_COURSE_CODE_REGEX,
  NUMBER_SEARCH_REGEX,
  extractDeptPrefix,
  fallbackTextMatch,
} from "../utils/formatting";
import { sanitizeNullableText } from "../utils/courseDetails";
import type {
  Course,
  CourseConditions,
  CourseSearchParams,
  DataSource,
  Department,
  InstructorLookup,
  InstructorMeta,
  Meeting,
  MergeConflict,
  Section,
} from "../types/coursePlanner";
import { fetchCourseSections as fetchPlannerSectionsFallback, searchCourses as searchCatalogCourses } from "@/lib/api/umdCourses";

const UMD_BASE = import.meta.env.VITE_UMD_API_BASE_URL ?? "https://api.umd.io/v1";
const JUPITER_BASE = import.meta.env.VITE_JUPITER_API_BASE_URL ?? "https://api.jupiterp.com";
const PLANETTERP_BASE = import.meta.env.VITE_PLANETTERP_API_BASE_URL ?? "https://planetterp.com/api/v1";

type SourceStatus = "ok" | "degraded" | "failed";

const searchJupiterCache = new CourseDataCache<Course[]>(20, 3 * 60 * 1000);
const searchUmdCache = new CourseDataCache<Course[]>(20, 3 * 60 * 1000);
const mergedSearchCache = new CourseDataCache<Course[]>(20, 3 * 60 * 1000);

const sectionJupiterCache = new CourseDataCache<Section[]>(80, 3 * 60 * 1000);
const sectionUmdCache = new CourseDataCache<Section[]>(80, 3 * 60 * 1000);
const mergedSectionCache = new CourseDataCache<Section[]>(80, 3 * 60 * 1000);

const deptCache = new CourseDataCache<Department[]>(1, 15 * 60 * 1000);
const instructorCache = new CourseDataCache<string[]>(5, 10 * 60 * 1000);
const instructorLookupCache = new CourseDataCache<InstructorLookup>(3, 20 * 60 * 1000);
const seasonFallbackCache = new CourseDataCache<{ term: string; year: number }>(64, 30 * 60 * 1000);

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function normalizeTermCode(term: string): string {
  return term.padStart(2, "0");
}

function parseSemesterCode(raw: string | number): { year: number; term: string } | null {
  const text = String(raw);
  if (!/^\d{6}$/.test(text)) {
    return null;
  }

  return {
    year: Number(text.slice(0, 4)),
    term: normalizeTermCode(text.slice(4)),
  };
}

async function resolveSeasonFallbackTerm(term: string, year: number, signal?: AbortSignal): Promise<{ term: string; year: number }> {
  const normalizedTerm = normalizeTermCode(term);
  const cacheKey = `${year}${normalizedTerm}`;

  return seasonFallbackCache.getOrSet(cacheKey, async () => {
    try {
      const url = new URL("courses/semesters", UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);
      const semesters = await getJson<Array<string | number>>(url.toString(), signal);

      const parsedSemesters = semesters
        .map(parseSemesterCode)
        .filter((entry): entry is { year: number; term: string } => Boolean(entry))
        .filter((entry) => entry.year <= year);

      const candidates = parsedSemesters
        .filter((entry) => entry.term === normalizedTerm && entry.year <= year)
        .sort((left, right) => right.year - left.year);

      if (candidates.length > 0) {
        return candidates[0];
      }

      // If no exact season exists yet (common for projected terms), use the latest
      // available semester up to the requested year so users can still search/generate.
      const latestAvailable = [...parsedSemesters].sort((left, right) => {
        if (left.year !== right.year) {
          return right.year - left.year;
        }
        return Number(right.term) - Number(left.term);
      })[0];

      if (latestAvailable) {
        return latestAvailable;
      }
    } catch {
      // Keep requested term/year when semester discovery fails.
    }

    return { term: normalizedTerm, year };
  });
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCreditsRange(raw: unknown): { minCredits: number; maxCredits: number } {
  const text = sanitizeNullableText(String(raw ?? ""));
  if (!text) {
    return { minCredits: 0, maxCredits: 0 };
  }

  const split = text.split("-").map((entry) => Number(entry.trim()));
  if (split.length === 2 && split.every((value) => Number.isFinite(value))) {
    return { minCredits: split[0], maxCredits: split[1] };
  }

  const single = Number(text);
  if (Number.isFinite(single)) {
    return { minCredits: single, maxCredits: single };
  }

  return { minCredits: 0, maxCredits: 0 };
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const clean = sanitizeNullableText(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out;
}

function canonicalMeetingKey(meeting: Meeting): string {
  return [
    sanitizeNullableText(meeting.days)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.startTime)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.endTime)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.building)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.room)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.location)?.toLowerCase() ?? "",
    sanitizeNullableText(meeting.classtype)?.toLowerCase() ?? "",
  ].join("|");
}

function dedupeMeetings(meetings: Meeting[]): Meeting[] {
  const seen = new Set<string>();
  const out: Meeting[] = [];

  for (const meeting of meetings) {
    const key = canonicalMeetingKey(meeting);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(meeting);
  }

  return out;
}

function normalizeMeeting(raw: any): Meeting {
  if (typeof raw === "string") {
    const [daysRaw, startRaw, endRaw, ...locationParts] = raw.split("-");
    const days = sanitizeNullableText(daysRaw) ?? "TBA";
    const startTime = sanitizeNullableText(startRaw);
    const endTime = sanitizeNullableText(endRaw);
    const building = sanitizeNullableText(locationParts[0]);
    const room = sanitizeNullableText(locationParts[1]);
    const location = sanitizeNullableText(locationParts.join(" ")) ?? sanitizeNullableText([building, room].filter(Boolean).join(" "));

    return {
      days,
      startTime,
      endTime,
      building,
      room,
      location,
      classtype: undefined,
    };
  }

  return {
    days: sanitizeNullableText(raw.days) ?? "TBA",
    startTime: sanitizeNullableText(raw.start_time ?? raw.startTime),
    endTime: sanitizeNullableText(raw.end_time ?? raw.endTime),
    building: sanitizeNullableText(raw.building),
    room: sanitizeNullableText(raw.room),
    location: sanitizeNullableText(raw.location ?? [raw.building, raw.room].filter(Boolean).join(" ")),
    classtype: sanitizeNullableText(raw.classtype ?? raw.meeting_type),
  };
}

function normalizeConditions(raw: any): CourseConditions | undefined {
  const prereqs = sanitizeNullableText(raw.prereqs ?? raw.prerequisites ?? raw.requisite_text ?? raw.requisites);
  const restrictions = sanitizeNullableText(raw.restrictions ?? raw.restriction_text);
  const additionalInfo = sanitizeNullableText(raw.additional_info ?? raw.additionalInfo ?? raw.notes);
  const creditGrantedFor = sanitizeNullableText(raw.credit_granted_for ?? raw.creditGrantedFor);

  const rawConditions = dedupeStrings([
    ...(Array.isArray(raw.conditions) ? raw.conditions : []),
    ...(Array.isArray(raw.condition_text) ? raw.condition_text : []),
    sanitizeNullableText(raw.condition),
  ]);

  if (!prereqs && !restrictions && !additionalInfo && !creditGrantedFor && rawConditions.length === 0) {
    return undefined;
  }

  return {
    prereqs: prereqs ?? undefined,
    restrictions: restrictions ?? undefined,
    additionalInfo: additionalInfo ?? undefined,
    creditGrantedFor: creditGrantedFor ?? undefined,
    rawConditions: rawConditions.length > 0 ? rawConditions : undefined,
  };
}

function toJupiterCourse(raw: any, term: string, year: number): Course {
  const courseCode = sanitizeNullableText(raw.courseCode ?? raw.course_id) ?? "";
  const name = sanitizeNullableText(raw.name ?? raw.title) ?? courseCode;
  const deptId = sanitizeNullableText(raw.deptId ?? raw.dept_id ?? courseCode.slice(0, 4)) ?? "GENR";

  const minFromSource = toNumber(raw.minCredits ?? raw.min_credits);
  const maxFromSource = toNumber(raw.maxCredits ?? raw.max_credits);
  const parsed = parseCreditsRange(raw.credits);
  const minCredits = minFromSource ?? parsed.minCredits;
  const maxCredits = maxFromSource ?? parsed.maxCredits;

  const genEds = dedupeStrings(
    (Array.isArray(raw.genEds) ? raw.genEds : Array.isArray(raw.gen_ed) ? raw.gen_ed.flat() : []) as string[]
  );

  const sections = Array.isArray(raw.sections) ? raw.sections.map((section: any) => toJupiterSection(section, courseCode)) : [];

  return {
    id: `${courseCode}-${year}${term}`,
    courseCode,
    name,
    deptId,
    credits: maxCredits,
    minCredits,
    maxCredits,
    description: sanitizeNullableText(raw.description) ?? undefined,
    genEds,
    conditions: normalizeConditions(raw),
    term,
    year,
    sections,
    sources: ["jupiter"],
    mergeConflicts: [],
  };
}

function toJupiterSection(raw: any, courseCode: string): Section {
  const instructors = dedupeStrings(Array.isArray(raw.instructors) ? raw.instructors : [raw.instructor]);

  return {
    id: sanitizeNullableText(raw.id ?? raw.section_id ?? `${courseCode}-${raw.sectionCode ?? raw.sec_code ?? raw.number}`) ?? `${courseCode}-section`,
    courseCode,
    sectionCode: sanitizeNullableText(raw.sectionCode ?? raw.sec_code ?? raw.number ?? raw.section_id) ?? "TBA",
    instructor: instructors.join(", "),
    instructors,
    totalSeats: toNumber(raw.totalSeats ?? raw.total_seats ?? raw.seats) ?? 0,
    openSeats: toNumber(raw.openSeats ?? raw.open_seats) ?? 0,
    waitlist: toNumber(raw.waitlist),
    holdfile: toNumber(raw.holdfile),
    updatedAt: sanitizeNullableText(raw.updatedAt ?? raw.updated_at) ?? undefined,
    meetings: dedupeMeetings((Array.isArray(raw.meetings) ? raw.meetings : []).map(normalizeMeeting)),
    sources: ["jupiter"],
    mergeConflicts: [],
  };
}

function toUmdCourse(raw: any, term: string, year: number): Course {
  const courseCode = sanitizeNullableText(raw.course_id ?? raw.courseCode) ?? "";
  const deptId = sanitizeNullableText(raw.dept_id ?? raw.deptId ?? courseCode.slice(0, 4)) ?? "GENR";
  const name = sanitizeNullableText(raw.name ?? raw.title) ?? courseCode;
  const parsedCredits = parseCreditsRange(raw.credits);
  const genEds = dedupeStrings(
    (Array.isArray(raw.gen_ed) ? raw.gen_ed.flat() : Array.isArray(raw.genEds) ? raw.genEds : []) as string[]
  );

  return {
    id: `${courseCode}-${year}${term}`,
    courseCode,
    name,
    deptId,
    credits: parsedCredits.maxCredits,
    minCredits: parsedCredits.minCredits,
    maxCredits: parsedCredits.maxCredits,
    description: sanitizeNullableText(raw.description) ?? undefined,
    genEds,
    conditions: normalizeConditions(raw),
    term,
    year,
    sections: [],
    sources: ["umd"],
    mergeConflicts: [],
  };
}

function toUmdSection(raw: any, courseCode: string): Section {
  const instructors = dedupeStrings(Array.isArray(raw.instructors) ? raw.instructors : [raw.instructor]);
  return {
    id: sanitizeNullableText(raw.section_id ?? raw.id ?? `${courseCode}-${raw.number}`) ?? `${courseCode}-section`,
    courseCode,
    sectionCode: sanitizeNullableText(raw.number ?? raw.sectionCode ?? raw.section_id) ?? "TBA",
    instructor: instructors.join(", "),
    instructors,
    totalSeats: toNumber(raw.seats ?? raw.totalSeats) ?? 0,
    openSeats: toNumber(raw.open_seats ?? raw.openSeats) ?? 0,
    waitlist: toNumber(raw.waitlist),
    holdfile: toNumber(raw.holdfile),
    updatedAt: sanitizeNullableText(raw.updated_at ?? raw.updatedAt) ?? undefined,
    meetings: dedupeMeetings((Array.isArray(raw.meetings) ? raw.meetings : []).map(normalizeMeeting)),
    sources: ["umd"],
    mergeConflicts: [],
  };
}

function formatMinutesToClock(minutes: number | undefined): string | undefined {
  if (!Number.isFinite(minutes)) {
    return undefined;
  }

  const bounded = Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes as number)));
  const hour24 = Math.floor(bounded / 60);
  const minute = bounded % 60;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function toSectionCodeFromFallback(raw: Awaited<ReturnType<typeof fetchPlannerSectionsFallback>>[number]): string {
  const explicit = sanitizeNullableText(raw.sectionCode);
  if (explicit) return explicit;

  const idTail = sanitizeNullableText(raw.id)?.split("-").pop();
  return idTail || "TBA";
}

function toPlannerSectionFromFallback(raw: Awaited<ReturnType<typeof fetchPlannerSectionsFallback>>[number]): Section {
  const openSeats = raw.openSeats ?? 0;
  const totalSeats = Math.max(raw.totalSeats ?? 0, openSeats);

  return {
    id: raw.id,
    courseCode: raw.courseId,
    sectionCode: toSectionCodeFromFallback(raw),
    instructor: raw.instructor ?? "",
    instructors: raw.instructor ? [raw.instructor] : [],
    totalSeats,
    openSeats,
    meetings: (raw.meetings ?? []).map((meeting) => ({
      days: meeting.days.length > 0 ? meeting.days.join("") : "TBA",
      startTime: formatMinutesToClock(meeting.startMinutes),
      endTime: formatMinutesToClock(meeting.endMinutes),
      location: meeting.location,
      classtype: undefined,
    })),
    sources: ["umd"],
    mergeConflicts: [],
  };
}

function preferTimestampedSeatValue(jupiter: Section, umd: Section): { openSeats: number; totalSeats: number; waitlist?: number; holdfile?: number; chosen: DataSource } {
  const jTime = sanitizeNullableText(jupiter.updatedAt);
  const uTime = sanitizeNullableText(umd.updatedAt);

  if (jTime && uTime) {
    const jMs = Date.parse(jTime);
    const uMs = Date.parse(uTime);
    if (Number.isFinite(jMs) && Number.isFinite(uMs)) {
      if (uMs > jMs) {
        return {
          openSeats: umd.openSeats,
          totalSeats: umd.totalSeats,
          waitlist: umd.waitlist,
          holdfile: umd.holdfile,
          chosen: "umd",
        };
      }
      return {
        openSeats: jupiter.openSeats,
        totalSeats: jupiter.totalSeats,
        waitlist: jupiter.waitlist,
        holdfile: jupiter.holdfile,
        chosen: "jupiter",
      };
    }
  }

  const jHasSeats = jupiter.totalSeats > 0 || jupiter.openSeats >= 0;
  if (jHasSeats) {
    return {
      openSeats: jupiter.openSeats,
      totalSeats: jupiter.totalSeats,
      waitlist: jupiter.waitlist,
      holdfile: jupiter.holdfile,
      chosen: "jupiter",
    };
  }

  return {
    openSeats: umd.openSeats,
    totalSeats: umd.totalSeats,
    waitlist: umd.waitlist,
    holdfile: umd.holdfile,
    chosen: "umd",
  };
}

function addConflict(conflicts: MergeConflict[], conflict: MergeConflict): void {
  conflicts.push(conflict);
}

function mergeConditions(jupiter?: CourseConditions, umd?: CourseConditions): CourseConditions | undefined {
  const prereqs = jupiter?.prereqs ?? umd?.prereqs;
  const restrictions = jupiter?.restrictions ?? umd?.restrictions;
  const additionalInfo = jupiter?.additionalInfo ?? umd?.additionalInfo;
  const creditGrantedFor = jupiter?.creditGrantedFor ?? umd?.creditGrantedFor;
  const rawConditions = dedupeStrings([...(jupiter?.rawConditions ?? []), ...(umd?.rawConditions ?? [])]);

  if (!prereqs && !restrictions && !additionalInfo && !creditGrantedFor && rawConditions.length === 0) {
    return undefined;
  }

  return {
    prereqs,
    restrictions,
    additionalInfo,
    creditGrantedFor,
    rawConditions: rawConditions.length ? rawConditions : undefined,
  };
}

function mergeSections(courseCode: string, jSections: Section[], uSections: Section[]): Section[] {
  const byKey = new Map<string, { j?: Section; u?: Section }>();

  for (const section of jSections) {
    byKey.set(`${courseCode}::${section.sectionCode}`, { j: section });
  }

  for (const section of uSections) {
    const key = `${courseCode}::${section.sectionCode}`;
    byKey.set(key, { ...(byKey.get(key) ?? {}), u: section });
  }

  const merged: Section[] = [];

  for (const [key, pair] of byKey.entries()) {
    if (pair.j && pair.u) {
      const conflicts: MergeConflict[] = [];
      const seatChoice = preferTimestampedSeatValue(pair.j, pair.u);
      const mergedMeetings = dedupeMeetings([...(pair.j.meetings ?? []), ...(pair.u.meetings ?? [])]);

      if (canonicalMeetingKey({ days: pair.j.meetings[0]?.days ?? "", location: pair.j.meetings[0]?.location } as Meeting) !==
          canonicalMeetingKey({ days: pair.u.meetings[0]?.days ?? "", location: pair.u.meetings[0]?.location } as Meeting) &&
          pair.j.meetings.length > 0 && pair.u.meetings.length > 0) {
        addConflict(conflicts, {
          field: "meetings",
          courseCode,
          sectionCode: pair.j.sectionCode,
          chosenSource: "jupiter",
          jupiterValue: JSON.stringify(pair.j.meetings),
          umdValue: JSON.stringify(pair.u.meetings),
        });
      }

      if (pair.j.openSeats !== pair.u.openSeats || pair.j.totalSeats !== pair.u.totalSeats) {
        addConflict(conflicts, {
          field: "seats",
          courseCode,
          sectionCode: pair.j.sectionCode,
          chosenSource: seatChoice.chosen,
          jupiterValue: `${pair.j.openSeats}/${pair.j.totalSeats}`,
          umdValue: `${pair.u.openSeats}/${pair.u.totalSeats}`,
        });
      }

      const primary = pair.j;
      const secondary = pair.u;
      merged.push({
        ...primary,
        id: primary.id || secondary.id,
        instructor: dedupeStrings([primary.instructor, secondary.instructor]).join(", "),
        instructors: dedupeStrings([...(primary.instructors ?? []), ...(secondary.instructors ?? [])]),
        meetings: mergedMeetings,
        openSeats: seatChoice.openSeats,
        totalSeats: seatChoice.totalSeats,
        waitlist: seatChoice.waitlist ?? primary.waitlist ?? secondary.waitlist,
        holdfile: seatChoice.holdfile ?? primary.holdfile ?? secondary.holdfile,
        sources: ["jupiter", "umd"],
        mergeConflicts: conflicts,
      });
      continue;
    }

    const single = pair.j ?? pair.u;
    if (single) {
      merged.push(single);
    }
  }

  return merged.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
}

function mergeCourses(jCourses: Course[], uCourses: Course[]): Course[] {
  const byCode = new Map<string, { j?: Course; u?: Course }>();

  for (const course of jCourses) {
    byCode.set(course.courseCode, { j: course });
  }

  for (const course of uCourses) {
    byCode.set(course.courseCode, { ...(byCode.get(course.courseCode) ?? {}), u: course });
  }

  const merged: Course[] = [];

  for (const [, pair] of byCode.entries()) {
    if (pair.j && pair.u) {
      const conflicts: MergeConflict[] = [];
      if ((pair.j.description ?? "") !== (pair.u.description ?? "") && pair.j.description && pair.u.description) {
        addConflict(conflicts, {
          field: "description",
          courseCode: pair.j.courseCode,
          chosenSource: "jupiter",
          jupiterValue: pair.j.description,
          umdValue: pair.u.description,
        });
      }

      const sections = mergeSections(pair.j.courseCode, pair.j.sections ?? [], pair.u.sections ?? []);

      merged.push({
        ...pair.j,
        name: pair.j.name || pair.u.name,
        description: pair.j.description ?? pair.u.description,
        minCredits: pair.j.minCredits || pair.u.minCredits,
        maxCredits: pair.j.maxCredits || pair.u.maxCredits,
        credits: pair.j.credits || pair.u.credits,
        genEds: dedupeStrings([...(pair.j.genEds ?? []), ...(pair.u.genEds ?? [])]),
        conditions: mergeConditions(pair.j.conditions, pair.u.conditions),
        sections,
        sources: ["jupiter", "umd"],
        mergeConflicts: conflicts,
      });
      continue;
    }

    const single = pair.j ?? pair.u;
    if (single) merged.push(single);
  }

  return merged.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

function applyClientFilters(courses: Course[], params: CourseSearchParams): Course[] {
  const query = params.normalizedInput;

  return courses.filter((course) => {
    if (params.filters.minCredits !== null && course.maxCredits < params.filters.minCredits) return false;
    if (params.filters.maxCredits !== null && course.minCredits > params.filters.maxCredits) return false;

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

async function fetchJupiterCourses(params: CourseSearchParams, signal?: AbortSignal): Promise<Course[]> {
  if (!JUPITER_BASE) return [];
  const resolvedTerm = await resolveSeasonFallbackTerm(params.term, params.year, signal);

  const url = new URL("/v0/courses/withSections", JUPITER_BASE);
  url.searchParams.set("limit", "300");
  url.searchParams.set("offset", "0");
  url.searchParams.set("term", resolvedTerm.term);
  url.searchParams.set("year", String(resolvedTerm.year));
  if (params.normalizedInput) {
    if (EXACT_COURSE_CODE_REGEX.test(params.normalizedInput)) {
      url.searchParams.set("courseCodes", params.normalizedInput);
    } else if (NUMBER_SEARCH_REGEX.test(params.normalizedInput)) {
      url.searchParams.set("number", params.normalizedInput);
    } else {
      const prefix = extractDeptPrefix(params.normalizedInput);
      if (prefix) url.searchParams.set("prefix", prefix);
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

  const rows = await getJson<any[]>(url.toString(), signal);
  return rows.map((row) => {
    const mapped = toJupiterCourse(row, params.term, params.year);
    if (!params.includeSections) {
      mapped.sections = [];
    }
    return mapped;
  });
}

async function fetchCatalogCourses(params: CourseSearchParams): Promise<Course[]> {
  const termCode = `${params.year}${params.term}`;
  const summaries = await searchCatalogCourses({
    termCode,
    query: params.normalizedInput,
    genEdTag: params.filters.genEds[0],
    page: 1,
    pageSize: 300,
  });

  return summaries.map((summary) => {
    const dept = summary.deptId || summary.id.slice(0, 4);
    return {
      id: `${summary.id}-${params.year}${params.term}`,
      courseCode: summary.id,
      name: summary.title,
      deptId: dept,
      credits: summary.credits,
      minCredits: summary.credits,
      maxCredits: summary.credits,
      description: summary.description,
      genEds: summary.genEdTags,
      term: params.term,
      year: params.year,
      sections: [],
      sources: ["umd"],
      mergeConflicts: [],
    } as Course;
  });
}

async function fetchUmdCourses(params: CourseSearchParams, signal?: AbortSignal): Promise<Course[]> {
  const resolvedTerm = await resolveSeasonFallbackTerm(params.term, params.year, signal);
  const departmentPrefix = extractDeptPrefix(params.normalizedInput);
  const pageLimit = params.normalizedInput ? 6 : 2;
  const allRows: any[] = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    const url = new URL("courses", UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);
    url.searchParams.set("semester", `${resolvedTerm.year}${resolvedTerm.term}`);
    url.searchParams.set("per_page", "120");
    url.searchParams.set("page", String(page));
    if (departmentPrefix) {
      url.searchParams.set("dept_id", departmentPrefix);
    }

    const rows = await getJson<any[]>(url.toString(), signal);
    if (!rows.length) break;
    allRows.push(...rows);
  }

  const baseCourses = allRows.map((row) => toUmdCourse(row, params.term, params.year));

  if (!params.includeSections || baseCourses.length === 0) {
    return baseCourses;
  }

  const sectionsByCourse = await Promise.all(
    baseCourses.map(async (course) => {
      try {
        const sections = await fetchUmdSectionsForCourse(course.courseCode, params.term, params.year, signal);
        return [course.courseCode, sections] as const;
      } catch {
        return [course.courseCode, [] as Section[]] as const;
      }
    })
  );

  const sectionMap = new Map<string, Section[]>(sectionsByCourse);

  return baseCourses.map((course) => ({
    ...course,
    sections: sectionMap.get(course.courseCode) ?? [],
  }));
}

async function fetchJupiterSectionsForCourse(courseCode: string, term: string, year: number, signal?: AbortSignal): Promise<Section[]> {
  if (!JUPITER_BASE) return [];
  const resolvedTerm = await resolveSeasonFallbackTerm(term, year, signal);
  const url = new URL("/v0/courses/withSections", JUPITER_BASE);
  url.searchParams.set("courseCodes", courseCode);
  url.searchParams.set("term", resolvedTerm.term);
  url.searchParams.set("year", String(resolvedTerm.year));
  const rows = await getJson<any[]>(url.toString(), signal);
  const rawSections = rows[0]?.sections ?? [];
  return rawSections.map((raw: any) => toJupiterSection(raw, courseCode));
}

async function fetchUmdSectionsForCourse(courseCode: string, term: string, year: number, signal?: AbortSignal): Promise<Section[]> {
  const resolvedTerm = await resolveSeasonFallbackTerm(term, year, signal);
  const url = new URL("courses/sections", UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);
  url.searchParams.set("semester", `${resolvedTerm.year}${resolvedTerm.term}`);
  url.searchParams.set("course_id", courseCode);
  const rows = await getJson<any[]>(url.toString(), signal);
  return rows.map((row) => toUmdSection(row, courseCode));
}

function normalizeInstructorKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function toPlanetTerpProfessorRows(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const maybeRows = (raw as any).results;
    if (Array.isArray(maybeRows)) return maybeRows;
  }
  return [];
}

function buildInstructorLookup(rows: any[]): InstructorLookup {
  const byKey = new Map<string, InstructorMeta>();

  for (const row of rows) {
    const name = sanitizeNullableText(row.name ?? row.professor ?? row.display_name);
    if (!name) continue;
    const key = normalizeInstructorKey(name);
    const slug = sanitizeNullableText(row.slug ?? row.professor_slug) ?? undefined;
    const averageRating = toNumber(row.average_rating ?? row.averageRating ?? row.avg_rating);

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { name, slug, averageRating, ambiguous: false });
      continue;
    }

    const isConflict = (existing.slug && slug && existing.slug !== slug) ||
      (existing.averageRating !== undefined && averageRating !== undefined && existing.averageRating !== averageRating);

    if (isConflict) {
      byKey.set(key, {
        name: existing.name,
        slug: existing.slug ?? slug,
        averageRating: existing.averageRating ?? averageRating,
        ambiguous: true,
      });
      continue;
    }

    byKey.set(key, {
      name: existing.name,
      slug: existing.slug ?? slug,
      averageRating: existing.averageRating ?? averageRating,
      ambiguous: false,
    });
  }

  const byName: Record<string, InstructorMeta> = {};
  for (const [key, value] of byKey.entries()) {
    byName[key] = value;
  }

  return { byName };
}

async function fetchPlanetTerpInstructorLookup(signal?: AbortSignal): Promise<InstructorLookup> {
  const limit = 500;
  let offset = 0;
  const rows: any[] = [];

  while (true) {
    const url = new URL("professors", PLANETTERP_BASE.endsWith("/") ? PLANETTERP_BASE : `${PLANETTERP_BASE}/`);
    url.searchParams.set("type", "professor");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const chunkRaw = await getJson<unknown>(url.toString(), signal).catch(() => []);
    const chunk = toPlanetTerpProfessorRows(chunkRaw);
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }

  return buildInstructorLookup(rows);
}

export function getInstructorMeta(lookup: InstructorLookup, instructorName: string): InstructorMeta | undefined {
  return lookup.byName[normalizeInstructorKey(instructorName)];
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
    if (!JUPITER_BASE) return [];
    const resolvedTerm = await resolveSeasonFallbackTerm(term, year, signal);

    const all: string[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const url = new URL("/v0/instructors/active", JUPITER_BASE);
      url.searchParams.set("term", resolvedTerm.term);
      url.searchParams.set("year", String(resolvedTerm.year));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(limit));

      const rows = await getJson<string[]>(url.toString(), signal).catch(() => []);
      if (!rows.length) break;
      all.push(...rows);
      if (rows.length < limit) break;
      offset += limit;
    }

    return Array.from(new Set(all.map((name) => name.trim()).filter(Boolean))).sort();
  });
}

export async function getInstructorLookup(term: string, year: number, signal?: AbortSignal): Promise<InstructorLookup> {
  return instructorLookupCache.getOrSet(`${term}-${year}`, async () => {
    return fetchPlanetTerpInstructorLookup(signal);
  });
}

async function settledSource<T>(fn: () => Promise<T>): Promise<{ status: SourceStatus; data: T | null; error?: string }> {
  try {
    const data = await fn();
    return { status: "ok", data };
  } catch (error) {
    return {
      status: "degraded",
      data: null,
      error: error instanceof Error ? error.message : "source failed",
    };
  }
}

function getSourceTimestamp(cache: CourseDataCache<unknown>, key: string): string {
  return String(cache.getUpdatedAt(key) ?? 0);
}

export async function searchCoursesWithStrategy(
  params: CourseSearchParams,
  signal?: AbortSignal
): Promise<Course[]> {
  const baseKey = JSON.stringify({
    q: params.normalizedInput,
    term: params.term,
    year: params.year,
    includeSections: params.includeSections,
    filters: params.filters,
  });

  const cKey = `catalog:${baseKey}`;
  const uKey = `umd:${baseKey}`;
  const jKey = `jupiter:${baseKey}`;

  // 1) Database-backed catalog path (includes same-season fallback in lib/api/umdCourses).
  const catalog = await settledSource(() => searchUmdCache.getOrSet(cKey, () => fetchCatalogCourses(params)));
  if (catalog.data && catalog.data.length > 0) {
    return applyClientFilters(catalog.data, params);
  }

  // 2) Direct UMD API path.
  const umd = await settledSource(() => searchUmdCache.getOrSet(uKey, () => fetchUmdCourses(params, signal)));
  if (umd.data && umd.data.length > 0) {
    return applyClientFilters(umd.data, params);
  }

  // 3) Jupiter fallback path.
  const jupiter = await settledSource(() => searchJupiterCache.getOrSet(jKey, () => fetchJupiterCourses(params, signal)));
  if (jupiter.data && jupiter.data.length > 0) {
    return applyClientFilters(jupiter.data, params);
  }

  if (catalog.error || umd.error || jupiter.error) {
    throw new Error(catalog.error ?? umd.error ?? jupiter.error ?? "All course sources failed");
  }

  return [];
}

export async function getSectionsForCourse(
  courseCode: string,
  term: string,
  year: number,
  signal?: AbortSignal
): Promise<Section[]> {
  const baseKey = `${year}${term}:${courseCode}`;

  // 1) Database-backed catalog path.
  const catalogSections = await settledSource(async () => {
    const termCode = `${year}${term}`;
    const rows = await fetchPlannerSectionsFallback(termCode, courseCode);
    return rows.map(toPlannerSectionFromFallback);
  });
  if (catalogSections.data && catalogSections.data.length > 0) {
    return catalogSections.data;
  }

  // 2) Direct UMD path.
  const uKey = `umd-sections:${baseKey}`;
  const umdSections = await settledSource(() => sectionUmdCache.getOrSet(uKey, () => fetchUmdSectionsForCourse(courseCode, term, year, signal)));
  if (umdSections.data && umdSections.data.length > 0) {
    return umdSections.data;
  }

  // 3) Jupiter fallback path.
  const jKey = `jupiter-sections:${baseKey}`;
  const jupiterSections = await settledSource(() => sectionJupiterCache.getOrSet(jKey, () => fetchJupiterSectionsForCourse(courseCode, term, year, signal)));
  if (jupiterSections.data && jupiterSections.data.length > 0) {
    return jupiterSections.data;
  }

  if (catalogSections.error || umdSections.error || jupiterSections.error) {
    throw new Error(catalogSections.error ?? umdSections.error ?? jupiterSections.error ?? "All section sources failed");
  }

  return [];
}
