import type {
  CourseSearchParams,
  DegreeRequirementRef,
  UmdCourseSummary,
  UmdSection,
  UmdSectionMeeting,
  UmdTerm,
} from "../types/course";

const API_BASE = import.meta.env.VITE_UMD_API_BASE_URL ?? "https://api.umd.io/v1";

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

export async function fetchTerms(): Promise<UmdTerm[]> {
  const terms = await getJson<Array<string | number>>("courses/semesters");
  return terms.map(parseTermCode).sort((a, b) => a.code.localeCompare(b.code));
}

export async function searchCourses(params: CourseSearchParams): Promise<UmdCourseSummary[]> {
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
