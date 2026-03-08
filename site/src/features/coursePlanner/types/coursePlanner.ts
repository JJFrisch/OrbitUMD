export type Weekday = "M" | "Tu" | "W" | "Th" | "F" | "Other";

export type VisibilityMode = "full" | "busy_free" | "off";

export interface Department {
  code: string;
  name: string;
}

export interface Meeting {
  days: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  building?: string;
  room?: string;
  classtype?: string;
}

export interface Section {
  id: string;
  courseCode: string;
  sectionCode: string;
  instructor: string;
  instructors: string[];
  totalSeats: number;
  openSeats: number;
  meetings: Meeting[];
}

export interface Course {
  id: string;
  courseCode: string;
  name: string;
  deptId: string;
  credits: number;
  description?: string;
  genEds: string[];
  term: string;
  year: number;
  sections?: Section[];
}

export interface CalendarMeeting {
  id: string;
  sectionKey: string;
  courseCode: string;
  sectionCode: string;
  title: string;
  instructor: string;
  day: Weekday;
  startHour: number;
  endHour: number;
  location?: string;
  conflictIndex: number;
  conflictTotal: number;
  isHoverPreview?: boolean;
}

export interface ScheduleSelection {
  sectionKey: string;
  course: Course;
  section: Section;
}

export interface SearchFilters {
  genEds: string[];
  instructorInput: string;
  instructor?: string;
  minCredits: number | null;
  maxCredits: number | null;
  onlyOpen: boolean;
  searchTerm: "" | "Winter" | "Spring" | "Summer" | "Fall";
}

export interface SearchState {
  input: string;
  normalizedInput: string;
  departmentSuggestions: string[];
  highlightedSuggestionIndex: number;
  pending: boolean;
  error?: string;
}

export interface CourseSearchParams {
  normalizedInput: string;
  term: string;
  year: number;
  filters: SearchFilters;
  includeSections: boolean;
}
