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
  credits: string;
  name: string;
  gen_ed?: string[];
  description?: string;
};

type UmdApiSection = {
  section_id: string;
  course: string;
  instructor?: string;
  seats?: string;
  meetings?: Array<{
    days: string;
    start_time: string;
    end_time: string;
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

function parseTermCode(termCode: string): UmdTerm {
  const year = Number(termCode.slice(0, 4));
  const seasonCode = termCode.slice(4);
  const season =
    seasonCode === "01"
      ? "winter"
      : seasonCode === "03"
        ? "spring"
        : seasonCode === "06"
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
  const [hourPart, minutePart] = raw.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  return hour * 60 + minute;
}

function parseSeats(raw?: string): { openSeats?: number; totalSeats?: number } {
  if (!raw) {
    return {};
  }

  const [open, total] = raw.split("/").map((value) => Number(value));
  return {
    openSeats: Number.isFinite(open) ? open : undefined,
    totalSeats: Number.isFinite(total) ? total : undefined,
  };
}

export async function fetchTerms(): Promise<UmdTerm[]> {
  const terms = await getJson<string[]>("terms");
  return terms.map(parseTermCode).sort((a, b) => a.code.localeCompare(b.code));
}

export async function searchCourses(params: CourseSearchParams): Promise<UmdCourseSummary[]> {
  const courses = await getJson<UmdApiCourse[]>("courses", {
    term: params.termCode,
    search: params.query,
    dept_id: params.deptId,
    gen_ed: params.genEdTag,
    page: params.page,
    per_page: params.pageSize,
  });

  return courses.map((course) => {
    const [deptId, number = ""] = course.course_id.split(/(?=\d)/);

    return {
      id: course.course_id,
      deptId: deptId ?? course.dept_id,
      number,
      title: course.name,
      credits: parseCredits(course.credits),
      genEdTags: course.gen_ed ?? [],
      description: course.description,
    };
  });
}

export async function fetchCourseSections(termCode: string, courseId: string): Promise<UmdSection[]> {
  const sections = await getJson<UmdApiSection[]>("courses/sections", {
    term: termCode,
    course: courseId,
  });

  return sections.map((section) => {
    const seats = parseSeats(section.seats);

    return {
      id: section.section_id,
      courseId: section.course,
      sectionCode: section.section_id,
      termCode,
      instructor: section.instructor,
      openSeats: seats.openSeats,
      totalSeats: seats.totalSeats,
      meetings:
        section.meetings?.map((meeting, index) => ({
          id: `${section.section_id}-${index}`,
          sectionId: section.section_id,
          days: parseDays(meeting.days),
          startMinutes: parseTimeToMinutes(meeting.start_time),
          endMinutes: parseTimeToMinutes(meeting.end_time),
          location: meeting.room,
          instructor: section.instructor,
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
