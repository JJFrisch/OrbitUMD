import { getCurrentAcademicTerm, compareAcademicTerms } from "@/lib/scheduling/termProgress";
import {
  listAllSchedulesWithSelections,
  saveScheduleWithSelections,
  type SaveScheduleInput,
  type ScheduleWithSelections,
} from "@/lib/repositories/userSchedulesRepository";

type QuickAddCourseInput = {
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds?: string[];
};

type CourseLike = {
  courseCode: string;
};

type SectionLike = {
  id: string;
  courseCode: string;
  sectionCode: string;
  instructor: string;
  instructors: string[];
  totalSeats: number;
  openSeats: number;
  meetings: Array<{
    days: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    building?: string;
    room?: string;
    classtype?: string;
  }>;
};

type ScheduleSelectionLike = {
  sectionKey: string;
  course: CourseLike;
  section: SectionLike;
};

type AddCourseResult = {
  added: boolean;
  scheduleName: string;
  reason?: string;
};

function parseSelections(stored: unknown): ScheduleSelectionLike[] {
  const payload = (stored ?? []) as { selections?: ScheduleSelectionLike[] } | ScheduleSelectionLike[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function termLabel(termCode: string, termYear: number): string {
  const name = termCode === "01"
    ? "Spring"
    : termCode === "05"
      ? "Summer"
      : termCode === "12"
        ? "Winter"
        : "Fall";
  return `${name} ${termYear}`;
}

function pickTargetSchedule(schedules: ScheduleWithSelections[]): ScheduleWithSelections | null {
  const current = getCurrentAcademicTerm();
  const primaryWithTerm = schedules.filter((schedule) => (
    schedule.is_primary && schedule.term_code && typeof schedule.term_year === "number"
  ));

  if (primaryWithTerm.length > 0) {
    const upcomingOrCurrent = primaryWithTerm
      .filter((schedule) => compareAcademicTerms(
        { termCode: schedule.term_code!, termYear: schedule.term_year! },
        current,
      ) >= 0)
      .sort((left, right) => compareAcademicTerms(
        { termCode: left.term_code!, termYear: left.term_year! },
        { termCode: right.term_code!, termYear: right.term_year! },
      ));

    if (upcomingOrCurrent.length > 0) {
      return upcomingOrCurrent[0];
    }

    return primaryWithTerm.sort((left, right) => compareAcademicTerms(
      { termCode: right.term_code!, termYear: right.term_year! },
      { termCode: left.term_code!, termYear: left.term_year! },
    ))[0] ?? null;
  }

  return null;
}

function makePlannedSelection(input: QuickAddCourseInput): ScheduleSelectionLike {
  const normalizedCode = input.courseCode.replace(/\s+/g, "").toUpperCase();
  const sectionCode = "PLANNED";

  return {
    sectionKey: `${normalizedCode}-${sectionCode}`,
    course: {
      courseCode: normalizedCode,
      name: input.courseTitle,
      id: normalizedCode,
      deptId: normalizedCode.slice(0, 4),
      credits: input.credits,
      minCredits: input.credits,
      maxCredits: input.credits,
      genEds: Array.isArray(input.genEds) ? input.genEds : [],
      term: "",
      year: 0,
      sections: [],
    } as CourseLike,
    section: {
      id: `${normalizedCode}-${sectionCode}`,
      courseCode: normalizedCode,
      sectionCode,
      instructor: "Planned",
      instructors: [],
      totalSeats: 0,
      openSeats: 0,
      meetings: [],
    },
  };
}

export async function addCourseToPrimarySchedule(input: QuickAddCourseInput): Promise<AddCourseResult> {
  const normalizedCode = input.courseCode.replace(/\s+/g, "").toUpperCase();
  const allSchedules = await listAllSchedulesWithSelections();
  let target = pickTargetSchedule(allSchedules);

  if (!target) {
    const current = getCurrentAcademicTerm();
    const created = await saveScheduleWithSelections({
      name: `MAIN ${termLabel(current.termCode, current.termYear)}`,
      termCode: current.termCode,
      termYear: current.termYear,
      isPrimary: true,
      selectionsJson: [],
    } satisfies SaveScheduleInput);
    target = created;
  }

  if (!target.term_code || typeof target.term_year !== "number") {
    throw new Error("Target schedule has no valid term information.");
  }

  const existingSelections = parseSelections(target.selections_json);
  const alreadyExists = existingSelections.some((selection) => (
    String(selection?.course?.courseCode ?? "").replace(/\s+/g, "").toUpperCase() === normalizedCode
  ));

  if (alreadyExists) {
    return {
      added: false,
      scheduleName: target.name,
      reason: `${normalizedCode} is already in ${target.name}.`,
    };
  }

  const nextSelections = [...existingSelections, makePlannedSelection(input)];

  await saveScheduleWithSelections({
    id: target.id,
    name: target.name,
    termCode: target.term_code,
    termYear: target.term_year,
    isPrimary: target.is_primary,
    selectionsJson: {
      sectionIds: nextSelections.map((selection) => selection.section.id || selection.sectionKey),
      selections: nextSelections,
    },
  } satisfies SaveScheduleInput);

  return {
    added: true,
    scheduleName: target.name,
  };
}
