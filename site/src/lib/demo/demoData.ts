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
  makeCourse("CMSC320", "Introduction to Data Science", 3, [], "01", 2025,
    makeSection("CMSC320", "0101", "Hector Corrada Bravo", [makeMeeting("TuTh", "9:30am", "10:45am", "IRB 1207")])),
  makeCourse("STAT400", "Applied Probability and Statistics I", 3, [], "01", 2025,
    makeSection("STAT400", "0101", "Yixin Chen", [makeMeeting("TuTh", "9:30am", "10:45am", "MTH 0101")])),
  makeCourse("COMM107", "Oral Communication", 3, ["FSAR", "FSOC"], "01", 2025,
    makeSection("COMM107", "0301", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "SKN 1115")])),
  makeCourse("MATH241", "Calculus III", 4, ["FSMA"], "01", 2025,
    makeSection("MATH241", "0201", "Justin Wyss-Gallifent", [makeMeeting("MWF", "9:00am", "9:50am", "MTH 0101")])),
  makeCourse("PHYS131", "Physics I", 3, ["SCIS"], "01", 2025,
    makeSection("PHYS131", "0101", "Staff", [makeMeeting("MWF", "1:00pm", "1:50pm", "PSC 1136")])),
  makeCourse("CHEM271", "Organic Chemistry I", 3, ["SCIS"], "01", 2025,
    makeSection("CHEM271", "0101", "Staff", [makeMeeting("TuTh", "10:00am", "11:15am", "CHM 2115")])),
  makeCourse("BIOL251", "General Biology", 3, ["SCIS"], "01", 2025,
    makeSection("BIOL251", "0101", "Staff", [makeMeeting("MWF", "2:00pm", "2:50pm", "BRB 1119")])),
  makeCourse("GEOG100", "World Regional Geography", 3, ["DSHU"], "01", 2025,
    makeSection("GEOG100", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "GEO 0312")])),
];

// Fall 2025 — in-progress current semester
const fall2025Courses = [
  // CMSC Core Courses
  makeCourse("CMSC330", "Organization of Programming Languages", 3, [], "08", 2025,
    makeSection("CMSC330", "0101", "Anwar Mamat", [makeMeeting("TuTh", "2:00pm", "3:15pm", "IRB 0324")])),
  makeCourse("CMSC351", "Algorithms", 3, [], "08", 2025,
    makeSection("CMSC351", "0201", "Clyde Kruskal", [makeMeeting("MWF", "1:00pm", "1:50pm", "IRB 0324")])),
  makeCourse("CMSC131", "Object-Oriented Programming I", 4, [], "08", 2025,
    makeSection("CMSC131", "0131", "Pedram Sadeghian", [makeMeeting("MWF", "9:00am", "9:50am", "CSI 2107")])),
  makeCourse("CMSC389L", "Production Practicum", 3, [], "08", 2025,
    makeSection("CMSC389L", "0101", "Staff", [makeMeeting("TuTh", "12:30pm", "1:45pm", "IRB 1207")])),
  // MATH Courses
  makeCourse("MATH240", "Introduction to Linear Algebra", 4, [], "08", 2025,
    makeSection("MATH240", "0301", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "MTH 0101")])),
  makeCourse("MATH241", "Calculus III", 4, ["FSMA"], "08", 2025,
    makeSection("MATH241", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "MTH 0101")])),
  makeCourse("MATH251", "Honors Multivariable Calculus", 4, ["FSMA"], "08", 2025,
    makeSection("MATH251", "0401", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "MTH 0311")])),
  // PHYS Courses
  makeCourse("PHYS131", "Physics I", 3, ["SCIS"], "08", 2025,
    makeSection("PHYS131", "0101", "Staff", [makeMeeting("MWF", "11:00am", "11:50am", "PSC 1136")])),
  makeCourse("PHYS132", "Physics Lab I", 1, [], "08", 2025,
    makeSection("PHYS132", "0101", "Staff", [makeMeeting("Th", "2:00pm", "5:50pm", "PSC 0224")])),
  // CHEM Courses
  makeCourse("CHEM271", "Organic Chemistry I", 3, ["SCIS"], "08", 2025,
    makeSection("CHEM271", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "CHM 2115")])),
  makeCourse("CHEM272", "Organic Chemistry Lab I", 2, [], "08", 2025,
    makeSection("CHEM272", "0101", "Staff", [makeMeeting("W", "1:00pm", "5:50pm", "CHM 0228")])),
  // BIOL Courses
  makeCourse("BIOL251", "General Biology", 3, ["SCIS"], "08", 2025,
    makeSection("BIOL251", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "BRB 1119")])),
  makeCourse("BIOL252", "Biology Lab", 1, [], "08", 2025,
    makeSection("BIOL252", "0101", "Staff", [makeMeeting("F", "12:00pm", "3:50pm", "BRB 1135")])),
  // GEOG Courses
  makeCourse("GEOG101", "World Geography", 3, ["DSHU"], "08", 2025,
    makeSection("GEOG101", "0101", "Staff", [makeMeeting("MWF", "2:00pm", "2:50pm", "GEO 0312")])),
  makeCourse("GEOG201", "Human Geography", 3, ["DSHU"], "08", 2025,
    makeSection("GEOG201", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "GEO 1121")])),
  // PHIL Courses
  makeCourse("PHIL170", "Introduction to Logic", 3, ["FSAR", "FSMA"], "08", 2025,
    makeSection("PHIL170", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "SKN 1116")])),
  makeCourse("PHIL175", "Goodness and Morality", 3, ["DSHS"], "08", 2025,
    makeSection("PHIL175", "0101", "Staff", [makeMeeting("MWF", "1:00pm", "1:50pm", "SKN 1115")])),
  // PSYC Courses
  makeCourse("PSYC100", "General Psychology", 3, ["DSHS"], "08", 2025,
    makeSection("PSYC100", "0203", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "SYK 0304")])),
  // ENGL Courses
  makeCourse("ENGL101", "Academic Writing", 3, ["FSAW"], "08", 2025,
    makeSection("ENGL101", "0101", "Staff", [makeMeeting("TuTh", "10:00am", "11:15am", "MCK 0301")])),
  makeCourse("ENGL393", "Special Topics: Introduction to Technical Writing", 3, [], "08", 2025,
    makeSection("ENGL393", "0101", "Staff", [makeMeeting("TuTh", "1:00pm", "2:15pm", "MCK 0212")])),
  // STAT Courses
  makeCourse("STAT400", "Applied Probability and Statistics I", 3, [], "08", 2025,
    makeSection("STAT400", "0201", "Staff", [makeMeeting("MWF", "11:00am", "11:50am", "MTH 0311")])),
  // ECON Courses
  makeCourse("ECON101", "Principles of Microeconomics", 3, ["DSHS"], "08", 2025,
    makeSection("ECON101", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "SQH 0102")])),
  // General Education
  makeCourse("AMS100", "American Studies", 3, ["DSHU"], "08", 2025,
    makeSection("AMS100", "0101", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "MCK 1121")])),
];

// Spring 2026 — planned next semester (comprehensive course catalog)
const spring2026Courses = [
  // CMSC Courses
  makeCourse("CMSC412", "Operating Systems", 4, [], "01", 2026,
    makeSection("CMSC412", "0101", "Jason Filippou", [makeMeeting("TuTh", "12:30pm", "1:45pm", "IRB 0324")])),
  makeCourse("CMSC320", "Introduction to Data Science", 3, [], "01", 2026,
    makeSection("CMSC320", "0101", "Hector Corrada Bravo", [makeMeeting("TuTh", "2:00pm", "3:15pm", "IRB 0324")])),
  makeCourse("CMSC434", "User Interface Design", 3, [], "01", 2026,
    makeSection("CMSC434", "0101", "Jon Froehlich", [makeMeeting("TuTh", "11:00am", "12:15pm", "IRB 1207")])),
  makeCourse("CMSC423", "Bioinformatics", 3, [], "01", 2026,
    makeSection("CMSC423", "0101", "Marina Sirota", [makeMeeting("MWF", "2:00pm", "2:50pm", "CSI 2117")])),
  makeCourse("CMSC430", "Introduction to Compilers", 3, [], "01", 2026,
    makeSection("CMSC430", "0101", "Michael Hicks", [makeMeeting("MWF", "11:00am", "11:50am", "IRB 0324")])),
  makeCourse("CMSC436", "Reinforcement Learning", 3, [], "01", 2026,
    makeSection("CMSC436", "0101", "Jordan Boyd-Graber", [makeMeeting("TuTh", "1:00pm", "2:15pm", "IRB 1207")])),
  makeCourse("CMSC498X", "Seminar on Robotics", 1, [], "01", 2026,
    makeSection("CMSC498X", "0101", "Cornelia Fermuller", [makeMeeting("W", "4:00pm", "5:00pm", "AVW 3258")])),
  // MATH Courses
  makeCourse("MATH246", "Differential Equations", 3, [], "01", 2026,
    makeSection("MATH246", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "MTH 0101")])),
  makeCourse("MATH461", "Complex Analysis", 3, [], "01", 2026,
    makeSection("MATH461", "0101", "Staff", [makeMeeting("MWF", "1:00pm", "1:50pm", "MTH 0311")])),
  makeCourse("MATH410", "Advanced Calculus", 3, [], "01", 2026,
    makeSection("MATH410", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "MTH 0101")])),
  makeCourse("MATH450", "Complete Introduction to Abstract Algebra", 3, [], "01", 2026,
    makeSection("MATH450", "0101", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "MTH 0311")])),
  // PHYS Courses
  makeCourse("PHYS260", "Physics for Scientists and Engineers I", 4, ["FSMA", "SCIS"], "01", 2026,
    makeSection("PHYS260", "0201", "Staff", [makeMeeting("MWF", "12:00pm", "12:50pm", "PSC 1136")])),
  makeCourse("PHYS261", "Physics Lab I", 1, [], "01", 2026,
    makeSection("PHYS261", "0101", "Staff", [makeMeeting("Tu", "3:00pm", "5:50pm", "PSC 0224")])),
  // CHEM Courses
  makeCourse("CHEM135", "General Chemistry", 3, ["FSMA", "SCIS"], "01", 2026,
    makeSection("CHEM135", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "CHM 2402")])),
  makeCourse("CHEM136", "General Chemistry Lab", 1, [], "01", 2026,
    makeSection("CHEM136", "0101", "Staff", [makeMeeting("Th", "2:00pm", "5:50pm", "CHM 0328")])),
  // BIOL Courses
  makeCourse("BIOL140", "General Biology", 3, ["SCIS"], "01", 2026,
    makeSection("BIOL140", "0101", "Staff", [makeMeeting("MWF", "8:00am", "8:50am", "BRB 1119")])),
  makeCourse("BIOL141", "Biology Lab", 1, [], "01", 2026,
    makeSection("BIOL141", "0101", "Staff", [makeMeeting("W", "2:00pm", "5:50pm", "BRB G130")])),
  // GEOG Courses
  makeCourse("GEOG100", "World Regional Geography", 3, ["DSHU"], "01", 2026,
    makeSection("GEOG100", "0101", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "GEO 0312")])),
  makeCourse("GEOG110", "Geography of North America", 3, ["DSHU"], "01", 2026,
    makeSection("GEOG110", "0101", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "GEO 0312")])),
  makeCourse("GEOG200", "World Climates", 3, ["SCIS"], "01", 2026,
    makeSection("GEOG200", "0101", "Staff", [makeMeeting("MWF", "10:00am", "10:50am", "GEO 1121")])),
  makeCourse("GEOG320", "Economic Geography", 3, ["DSHS"], "01", 2026,
    makeSection("GEOG320", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "GEO 0312")])),
  // PSYC Courses
  makeCourse("PSYC100", "General Psychology", 3, ["DSHS"], "01", 2026,
    makeSection("PSYC100", "0101", "Staff", [makeMeeting("MWF", "1:00pm", "1:50pm", "SYK 0304")])),
  makeCourse("PSYC200", "Research Design and Analysis", 3, [], "01", 2026,
    makeSection("PSYC200", "0101", "Staff", [makeMeeting("TuTh", "12:30pm", "1:45pm", "SYK 0304")])),
  makeCourse("PSYC370", "Cognitive Psychology", 3, [], "01", 2026,
    makeSection("PSYC370", "0101", "Staff", [makeMeeting("MWF", "11:00am", "11:50am", "SYK 0304")])),
  // ENGL Courses
  makeCourse("ENGL220", "World Literature", 3, ["DSHU"], "01", 2026,
    makeSection("ENGL220", "0101", "Staff", [makeMeeting("TuTh", "11:00am", "12:15pm", "MCK 0301")])),
  makeCourse("ENGL280", "Literature and Film", 3, ["DSHU"], "01", 2026,
    makeSection("ENGL280", "0101", "Staff", [makeMeeting("TuTh", "2:00pm", "3:15pm", "MCK 0212")])),
  // HIST Courses
  makeCourse("HIST120", "Modern Europe", 3, ["DSHU"], "01", 2026,
    makeSection("HIST120", "0101", "Staff", [makeMeeting("MWF", "2:00pm", "2:50pm", "KEY 0106")])),
  makeCourse("HIST150", "Modern America", 3, ["DSHU"], "01", 2026,
    makeSection("HIST150", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "KEY 0106")])),
  // ECON Courses
  makeCourse("ECON101", "Principles of Microeconomics", 3, ["DSHS"], "01", 2026,
    makeSection("ECON101", "0101", "Staff", [makeMeeting("MWF", "9:00am", "9:50am", "SQH 0102")])),
  makeCourse("ECON102", "Principles of Macroeconomics", 3, ["DSHS"], "01", 2026,
    makeSection("ECON102", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "SQH 0102")])),
  // STAT Courses
  makeCourse("STAT401", "Applied Probability and Statistics II", 3, [], "01", 2026,
    makeSection("STAT401", "0101", "Staff", [makeMeeting("MWF", "1:00pm", "1:50pm", "MTH 0311")])),
  // ARHU/General Ed
  makeCourse("ARHU298", "Introduction to Digital Cultures", 3, ["DSHU", "SCIS"], "01", 2026,
    makeSection("ARHU298", "0101", "Staff", [makeMeeting("TuTh", "9:30am", "10:45am", "TWS 2130")])),
  makeCourse("MUSC100", "Music Appreciation", 2, ["FSHO"], "01", 2026,
    makeSection("MUSC100", "0101", "Staff", [makeMeeting("TuTh", "1:00pm", "1:50pm", "MGH 0118")])),
  makeCourse("ARTT101", "Art History", 3, ["DSHU"], "01", 2026,
    makeSection("ARTT101", "0101", "Staff", [makeMeeting("MWF", "3:00pm", "3:50pm", "TWS 1117")])),
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
