export type Weekday = "M" | "Tu" | "W" | "Th" | "F" | "Other";

export type VisibilityMode = "full" | "busy_free" | "off";

export type DataSource = "jupiter" | "umd";

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

export interface MergeConflict {
  field: string;
  courseCode: string;
  sectionCode?: string;
  chosenSource: DataSource;
  jupiterValue?: string;
  umdValue?: string;
}

export interface CourseConditions {
  prereqs?: string;
  restrictions?: string;
  additionalInfo?: string;
  creditGrantedFor?: string;
  rawConditions?: string[];
}

export interface Section {
  id: string;
  courseCode: string;
  sectionCode: string;
  instructor: string;
  instructors: string[];
  totalSeats: number;
  openSeats: number;
  waitlist?: number;
  holdfile?: number;
  updatedAt?: string;
  meetings: Meeting[];
  sources?: DataSource[];
  mergeConflicts?: MergeConflict[];
}

export interface Course {
  id: string;
  courseCode: string;
  name: string;
  deptId: string;
  credits: number;
  minCredits: number;
  maxCredits: number;
  description?: string;
  genEds: string[];
  conditions?: CourseConditions;
  term: string;
  year: number;
  sections?: Section[];
  sources?: DataSource[];
  mergeConflicts?: MergeConflict[];
}

export interface InstructorMeta {
  name: string;
  slug?: string;
  averageRating?: number;
  ambiguous?: boolean;
}

export interface InstructorLookup {
  byName: Record<string, InstructorMeta>;
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
