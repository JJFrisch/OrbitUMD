/**
 * Realistic demo data for a UMD Computer Science junior.
 *
 * All IDs use a "demo-" prefix so they can never collide with real DB rows.
 * Course codes, gen-ed tags, and credit values are real UMD catalog entries.
 */

import { DEMO_USER_ID } from "./demoMode";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import type { UserPriorCreditRecord } from "@/lib/types/requirements";
import type { Course, Section, Meeting } from "@/features/coursePlanner/types/coursePlanner";

// ── Helpers ──

function demoId(label: string): string {
  return `demo-${label}`;
}

function makeMeeting(days: string, start: string, end: string, location?: string): Meeting {
  return { days, startTime: start, endTime: end, location };
}

function makeSection(courseCode: string, sectionCode: string, instructor: string, meetings: Meeting[]): Section {
  return {
    id: demoId(`${courseCode}-${sectionCode}`),
    courseCode,
    sectionCode,
    instructor,
    instructors: [instructor],
    totalSeats: 40,
    openSeats: 12,
    meetings,
  };
}

function makeCourse(
  code: string,
  name: string,
  credits: number,
  genEds: string[],
  term: string,
  year: number,
  section: Section,
): { course: Course; section: Section } {
  return {
    course: {
      id: demoId(code),
      courseCode: code,
      name,
      deptId: code.replace(/\d+.*/, ""),
      credits,
      minCredits: credits,
      maxCredits: credits,
      genEds,
      term,
      year,
      sections: [section],
    },
    section,
  };
}

// ── Degree Programs ──

export const DEMO_PROGRAMS: UserDegreeProgram[] = [
  {
    id: demoId("prog-cs"),
    userId: DEMO_USER_ID,
    programId: demoId("catalog-cs"),
    isPrimary: true,
    createdAt: "2024-08-01T00:00:00Z",
    programCode: "CMSC-BS",
    programName: "Computer Science, B.S.",
    college: "College of Computer, Mathematical, and Natural Sciences",
    degreeType: "major",
    catalogYear: "2024",
  },
  {
    id: demoId("prog-math-minor"),
    userId: DEMO_USER_ID,
    programId: demoId("catalog-math-minor"),
    isPrimary: false,
    createdAt: "2024-08-01T00:00:00Z",
    programCode: "MATH-MINOR",
    programName: "Mathematics, Minor",
    college: "College of Computer, Mathematical, and Natural Sciences",
    degreeType: "minor",
    catalogYear: "2024",
  },
];

// ── Prior Credits (AP scores) ──

export const DEMO_PRIOR_CREDITS: UserPriorCreditRecord[] = [
  {
    id: demoId("ap-calc-bc"),
    userId: DEMO_USER_ID,
    sourceType: "AP",
    importOrigin: "manual",
    originalName: "AP Calculus BC",
    umdCourseCode: "MATH141",
    credits: 4,
    genEdCodes: ["FSMA"],
    grade: "5",
    countsTowardProgress: true,
    createdAt: "2024-06-01T00:00:00Z",
  },
  {
    id: demoId("ap-csa"),
    userId: DEMO_USER_ID,
    sourceType: "AP",
    importOrigin: "manual",
    originalName: "AP Computer Science A",
    umdCourseCode: "CMSC131",
    credits: 4,
    genEdCodes: [],
    grade: "5",
    countsTowardProgress: true,
    createdAt: "2024-06-01T00:00:00Z",
  },
  {
    id: demoId("ap-eng-lang"),
    userId: DEMO_USER_ID,
    sourceType: "AP",
    importOrigin: "manual",
    originalName: "AP English Language",
    umdCourseCode: "ENGL101",
    credits: 3,
    genEdCodes: ["FSAW"],
    grade: "4",
    countsTowardProgress: true,
    createdAt: "2024-06-01T00:00:00Z",
  },
  {
    id: demoId("ap-physics-1"),
    userId: DEMO_USER_ID,
    sourceType: "AP",
    importOrigin: "manual",
    originalName: "AP Physics 1",
    umdCourseCode: "PHYS141",
    credits: 3,
    genEdCodes: ["DSNL"],
    grade: "4",
    countsTowardProgress: true,
    createdAt: "2024-06-01T00:00:00Z",
  },
];

// ── Schedules ──

// Fall 2024 — completed first semester
const fall2024Courses = [
  makeCourse("CMSC132", "Object-Oriented Programming II", 4, [], "08", 2024,
    makeSection("CMSC132", "0101", "Fawzi Emad", [makeMeeting("MWF", "10:00am", "10:50am", "IRB 0324")])),
  makeCourse("MATH241", "Calculus III", 4, ["FSMA"], "08", 2024,
    makeSection("MATH241", "0201", "Justin Wyss-Gallifent", [makeMeeting("MWF", "11:00am", "11:50am", "MTH 0101")])),
  makeCourse("ENGL101", "Academic Writing", 3, ["FSAW"], "08", 2024,
    makeSection("ENGL101", "0105", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "TWS 1101")])),
  makeCourse("HIST200", "Interpreting History", 3, ["DSHU", "SCIS"], "08", 2024,
    makeSection("HIST200", "0101", "Colleen Woods", [makeMeeting("TuTh", "11:00am", "12:15pm", "KEY 0117")])),
];

// Spring 2025 — completed second semester
const spring2025Courses = [
  makeCourse("CMSC216", "Introduction to Computer Systems", 4, [], "01", 2025,
    makeSection("CMSC216", "0101", "Larry Herman", [makeMeeting("MWF", "10:00am", "10:50am", "IRB 0324")])),
  makeCourse("CMSC250", "Discrete Structures", 4, [], "01", 2025,
    makeSection("CMSC250", "0201", "Clyde Kruskal", [makeMeeting("MWF", "11:00am", "11:50am", "CSI 2117")])),
  makeCourse("STAT400", "Applied Probability and Statistics I", 3, [], "01", 2025,
    makeSection("STAT400", "0101", "Yixin Chen", [makeMeeting("TuTh", "9:30am", "10:45am", "MTH 0101")])),
  makeCourse("COMM107", "Oral Communication", 3, ["FSAR", "FSOC"], "01", 2025,
    makeSection("COMM107", "0301", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "SKN 1115")])),
];

// Fall 2025 — in-progress current semester
const fall2025Courses = [
  makeCourse("CMSC330", "Organization of Programming Languages", 3, [], "08", 2025,
    makeSection("CMSC330", "0101", "Anwar Mamat", [makeMeeting("TuTh", "2:00pm", "3:15pm", "IRB 0324")])),
  makeCourse("CMSC351", "Algorithms", 3, [], "08", 2025,
    makeSection("CMSC351", "0201", "Clyde Kruskal", [makeMeeting("MWF", "1:00pm", "1:50pm", "IRB 0324")])),
  makeCourse("MATH240", "Introduction to Linear Algebra", 4, [], "08", 2025,
    makeSection("MATH240", "0301", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "MTH 0101")])),
  makeCourse("PHIL170", "Introduction to Logic", 3, ["FSAR", "FSMA"], "08", 2025,
    makeSection("PHIL170", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "SKN 1116")])),
];

// Spring 2026 — planned next semester
const spring2026Courses = [
  makeCourse("CMSC412", "Operating Systems", 4, [], "01", 2026,
    makeSection("CMSC412", "0101", "Jason Filippou", [makeMeeting("TuTh", "12:30pm", "1:45pm", "IRB 0324")])),
  makeCourse("CMSC320", "Introduction to Data Science", 3, [], "01", 2026,
    makeSection("CMSC320", "0101", "Hector Corrada Bravo", [makeMeeting("TuTh", "2:00pm", "3:15pm", "IRB 0324")])),
  makeCourse("MATH246", "Differential Equations", 3, [], "01", 2026,
    makeSection("MATH246", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "MTH 0101")])),
  makeCourse("ARHU298", "Introduction to Digital Cultures", 3, ["DSHU", "SCIS"], "01", 2026,
    makeSection("ARHU298", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "TWS 2130")])),
];

function buildSchedule(
  id: string,
  name: string,
  termCode: string,
  termYear: number,
  courses: ReturnType<typeof makeCourse>[],
  grades?: Record<string, string>,
): ScheduleWithSelections {
  return {
    id: demoId(id),
    user_id: DEMO_USER_ID,
    term_id: demoId(`term-${termCode}-${termYear}`),
    name,
    is_primary: true,
    created_at: `${termYear}-${termCode === "08" ? "08" : "01"}-15T00:00:00Z`,
    updated_at: `${termYear}-${termCode === "08" ? "12" : "05"}-01T00:00:00Z`,
    term_code: termCode,
    term_year: termYear,
    selections_json: courses.map(({ course, section }) => ({
      sectionKey: section.id,
      course,
      section,
      grade: grades?.[course.courseCode],
    })),
  };
}

export const DEMO_SCHEDULES: ScheduleWithSelections[] = [
  buildSchedule("sched-fall24", "Fall 2024", "08", 2024, fall2024Courses, {
    CMSC132: "A",
    MATH241: "B+",
    ENGL101: "A-",
    HIST200: "A",
  }),
  buildSchedule("sched-spring25", "Spring 2025", "01", 2025, spring2025Courses, {
    CMSC216: "A-",
    CMSC250: "B+",
    STAT400: "B",
    COMM107: "A",
  }),
  buildSchedule("sched-fall25", "Fall 2025", "08", 2025, fall2025Courses),
  buildSchedule("sched-spring26", "Spring 2026", "01", 2026, spring2026Courses),
];

// ── Demo Profile ──

export const DEMO_PROFILE = {
  id: DEMO_USER_ID,
  display_name: "Alex Thompson",
  email: "demo@orbitumd.app",
  university_uid: "demo-uid-0001",
};
