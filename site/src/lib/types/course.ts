export type TermSeason = "spring" | "summer" | "fall" | "winter";

export interface UmdTerm {
  code: string;
  season: TermSeason;
  year: number;
  label: string;
}

export interface UmdCourseSummary {
  id: string;
  deptId: string;
  number: string;
  title: string;
  credits: number;
  genEdTags: string[];
  description?: string;
  relationships?: {
    prereqs?: string;
  };
}

export interface UmdSectionMeeting {
  id: string;
  sectionId: string;
  days: Array<"M" | "Tu" | "W" | "Th" | "F">;
  startMinutes: number;
  endMinutes: number;
  location?: string;
  instructor?: string;
}

export interface UmdSection {
  id: string;
  courseId: string;
  sectionCode: string;
  termCode: string;
  instructor?: string;
  openSeats?: number;
  totalSeats?: number;
  meetings: UmdSectionMeeting[];
}

export interface CourseSearchParams {
  termCode: string;
  query?: string;
  deptId?: string;
  genEdTag?: string;
  page?: number;
  pageSize?: number;
}

export interface DegreeRequirementRef {
  requirementCode: string;
  requirementTitle: string;
  source: "gen_ed" | "major";
}
