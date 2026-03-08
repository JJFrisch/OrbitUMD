import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  Filter,
  Info,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { fetchCourseSections, fetchTerms, searchCourses } from "../../lib/api/umdCourses";
import { detectScheduleConflicts } from "../../lib/scheduling/conflicts";
import type { UmdCourseSummary, UmdSection, UmdTerm } from "../../lib/types/course";

const ORBIT_RED = "#E21833";

const courseBlockColors = [
  "bg-[#DBE6FA] border-[#B9C9EB]",
  "bg-[#F8D8D8] border-[#EDBBBB]",
  "bg-[#D8ECE8] border-[#B9DDD7]",
  "bg-[#E7D8EF] border-[#D5BFE2]",
  "bg-[#EDE8BF] border-[#E1D89A]",
  "bg-[#F9E4CC] border-[#EFD0A8]",
];

const weekdayOrder: Record<string, number> = { M: 1, Tu: 2, W: 3, Th: 4, F: 5 };

interface AddedCourse {
  course: UmdCourseSummary;
  section: UmdSection;
}

interface SavedSchedule {
  id: string;
  name: string;
  termCode: string;
  termLabel: string;
  courses: AddedCourse[];
  createdAt: string;
}

function formatMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const ampm = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${ampm}`;
}

function formatHourLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${ampm}`;
}

function formatMeetingSummary(section: UmdSection): string {
  if (section.meetings.length === 0) {
    return "No listed meeting time";
  }

  return section.meetings
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .map((meeting) => {
      const days = meeting.days.slice().sort((a, b) => weekdayOrder[a] - weekdayOrder[b]).join("");
      return `${days} ${formatMinutes(meeting.startMinutes)}-${formatMinutes(meeting.endMinutes)}`;
    })
    .join(" · ");
}

export default function ScheduleBuilder() {
  const [activeTab, setActiveTab] = useState<"build" | "view">("build");
  const [terms, setTerms] = useState<UmdTerm[]>([]);
  const [selectedTermCode, setSelectedTermCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UmdCourseSummary[]>([]);
  const [sectionsByCourse, setSectionsByCourse] = useState<Record<string, UmdSection[]>>({});
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [loadingCourseSectionsId, setLoadingCourseSectionsId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scheduleName, setScheduleName] = useState("MAIN");
  const [addedCourses, setAddedCourses] = useState<AddedCourse[]>([]);
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);

  const [selectedGenEd, setSelectedGenEd] = useState<string>("");
  const [minCredits, setMinCredits] = useState(0);
  const [maxCredits, setMaxCredits] = useState(20);
  const [instructorFilter, setInstructorFilter] = useState("");
  const [onlyOpenSections, setOnlyOpenSections] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTerms() {
      setIsLoadingTerms(true);
      setLoadError(null);

      try {
        const fetchedTerms = await fetchTerms();
        const recentTerms = fetchedTerms.slice(-8).reverse();
        if (!active) return;
        setTerms(recentTerms);
        if (!selectedTermCode && recentTerms[0]) {
          setSelectedTermCode(recentTerms[0].code);
        }
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load terms");
      } finally {
        if (active) {
          setIsLoadingTerms(false);
        }
      }
    }

    loadTerms();

    return () => {
      active = false;
    };
  }, [selectedTermCode]);

  useEffect(() => {
    if (!selectedTermCode) return;

    let active = true;

    async function loadCourses() {
      setIsLoadingCourses(true);
      setLoadError(null);

      try {
        const courses = await searchCourses({
          termCode: selectedTermCode,
          query: searchQuery.trim() || undefined,
          genEdTag: selectedGenEd || undefined,
          page: 1,
          pageSize: 30,
        });

        if (!active) return;
        setSearchResults(courses);
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load courses");
      } finally {
        if (active) setIsLoadingCourses(false);
      }
    }

    loadCourses();

    return () => {
      active = false;
    };
  }, [selectedTermCode, searchQuery, selectedGenEd]);

  const selectedTerm = useMemo(
    () => terms.find((term) => term.code === selectedTermCode) ?? null,
    [terms, selectedTermCode]
  );

  const conflicts = useMemo(
    () => detectScheduleConflicts(addedCourses.map((course) => course.section)),
    [addedCourses]
  );

  const conflictingSectionIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach((conflict) => {
      ids.add(conflict.left.sectionId);
      ids.add(conflict.right.sectionId);
    });
    return ids;
  }, [conflicts]);

  const filteredCourses = useMemo(() => {
    return searchResults.filter((course) => {
      if (course.credits < minCredits || course.credits > maxCredits) return false;

      const sections = sectionsByCourse[course.id] ?? [];

      if (instructorFilter && sections.length > 0) {
        const hasInstructor = sections.some((section) =>
          (section.instructor ?? "").toLowerCase().includes(instructorFilter.toLowerCase())
        );
        if (!hasInstructor) return false;
      }

      if (onlyOpenSections && sections.length > 0) {
        const hasOpen = sections.some(
          (section) => (section.openSeats ?? 0) > 0 && (section.totalSeats ?? 0) > 0
        );
        if (!hasOpen) return false;
      }

      return true;
    });
  }, [searchResults, minCredits, maxCredits, sectionsByCourse, instructorFilter, onlyOpenSections]);

  const totalCredits = useMemo(
    () => addedCourses.reduce((sum, course) => sum + course.course.credits, 0),
    [addedCourses]
  );

  const activeFiltersCount =
    (selectedGenEd ? 1 : 0) +
    (minCredits > 0 ? 1 : 0) +
    (maxCredits < 20 ? 1 : 0) +
    (instructorFilter ? 1 : 0) +
    (onlyOpenSections ? 1 : 0);

  async function handleExpandCourse(courseId: string) {
    const nextId = expandedCourseId === courseId ? null : courseId;
    setExpandedCourseId(nextId);

    if (!nextId || sectionsByCourse[courseId]) return;

    setLoadingCourseSectionsId(courseId);
    setLoadError(null);

    try {
      const sections = await fetchCourseSections(selectedTermCode, courseId);
      setSectionsByCourse((prev) => ({ ...prev, [courseId]: sections }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load sections");
    } finally {
      setLoadingCourseSectionsId(null);
    }
  }

  function addSectionToSchedule(course: UmdCourseSummary, section: UmdSection) {
    setAddedCourses((prev) => {
      const exists = prev.some((item) => item.section.id === section.id);
      if (exists) return prev;
      return [...prev, { course, section }];
    });
  }

  function removeSectionFromSchedule(sectionId: string) {
    setAddedCourses((prev) => prev.filter((item) => item.section.id !== sectionId));
  }

  function saveSchedule() {
    if (!scheduleName.trim() || !selectedTerm) return;

    const next: SavedSchedule = {
      id: String(Date.now()),
      name: scheduleName.trim(),
      termCode: selectedTerm.code,
      termLabel: selectedTerm.label,
      courses: addedCourses,
      createdAt: new Date().toISOString(),
    };

    setSavedSchedules((prev) => [next, ...prev]);
  }

  function loadSavedSchedule(scheduleId: string) {
    const schedule = savedSchedules.find((item) => item.id === scheduleId);
    if (!schedule) return;

    setScheduleName(schedule.name);
    setSelectedTermCode(schedule.termCode);
    setAddedCourses(schedule.courses);
    setActiveTab("build");
  }

  function clearFilters() {
    setSelectedGenEd("");
    setMinCredits(0);
    setMaxCredits(20);
    setInstructorFilter("");
    setOnlyOpenSections(false);
  }

  const calendarDays: Array<{ key: "M" | "Tu" | "W" | "Th" | "F"; label: string }> = [
    { key: "M", label: "Mon" },
    { key: "Tu", label: "Tue" },
    { key: "W", label: "Wed" },
    { key: "Th", label: "Thu" },
    { key: "F", label: "Fri" },
  ];

  const CALENDAR_START = 9 * 60;
  const CALENDAR_END = 19 * 60;
  const HOUR_HEIGHT = 68;

  const calendarBlocks = useMemo(() => {
    return addedCourses.flatMap((item, idx) => {
      const colorClass = courseBlockColors[idx % courseBlockColors.length];

      return item.section.meetings.flatMap((meeting) =>
        meeting.days.map((day) => ({
          day,
          startMinutes: meeting.startMinutes,
          endMinutes: meeting.endMinutes,
          sectionId: item.section.id,
          code: item.course.id,
          sectionCode: item.section.sectionCode,
          instructor: item.section.instructor,
          location: meeting.location,
          colorClass,
        }))
      );
    });
  }, [addedCourses]);

  const hourlyLabels = useMemo(() => {
    const labels: number[] = [];
    for (let t = CALENDAR_START; t <= CALENDAR_END; t += 60) {
      labels.push(t);
    }
    return labels;
  }, []);

  const draftTitle = selectedTerm ? `${scheduleName || "MAIN"} - ${selectedTerm.label}` : "Schedule Draft";

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <h1 className="mb-1 text-4xl font-semibold tracking-tight text-foreground">Schedule Builder</h1>
        <p className="mb-4 text-sm text-muted-foreground">Orbit-styled planner with Jupiterp-style spacing and timetable density.</p>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "build" | "view")}> 
          <TabsList className="mb-4 border border-[#D9D9DE] bg-white">
            <TabsTrigger value="build">Course Planner</TabsTrigger>
            <TabsTrigger value="view">
              <Eye className="mr-1 h-4 w-4" />
              Saved Schedules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
              <Card className="border-[#D9D9DE] bg-white p-0 shadow-sm">
                <div className="border-b border-[#E4E4E8] px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#2D2D33]">Schedules</h3>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setScheduleName(`Option ${savedSchedules.length + 1}`)}>
                      <Plus className="mr-1 h-3 w-3" /> Add schedule
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <button className="w-full rounded-md border border-[#E4E4E8] bg-[#FAFAFC] px-2 py-1 text-left text-sm font-medium text-[#2D2D33]">
                      {draftTitle}
                    </button>
                    {savedSchedules.map((schedule) => (
                      <button
                        key={schedule.id}
                        className="w-full rounded-md px-2 py-1 text-left text-xs text-[#5B5B65] hover:bg-[#F3F3F7]"
                        onClick={() => loadSavedSchedule(schedule.id)}
                      >
                        {schedule.name} - {schedule.termLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-[#5B5B65]">Term</Label>
                    <Select value={selectedTermCode} onValueChange={setSelectedTermCode}>
                      <SelectTrigger className="h-9 border-[#D9D9DE] bg-[#FBFBFD] text-[#2D2D33]">
                        <SelectValue placeholder={isLoadingTerms ? "Loading terms..." : "Pick term"} />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.code} value={term.code}>{term.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A96]" />
                    <Input
                      className="h-9 border-[#D9D9DE] bg-[#FBFBFD] pl-10 text-[#2D2D33]"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search courses"
                    />
                  </div>

                  <Card className="border-[#E4E4E8] bg-[#FCFCFE] p-0 shadow-none">
                    <button
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      onClick={() => setShowFilters((value) => !value)}
                    >
                      <div className="flex items-center gap-2 text-sm text-[#4D4D58]">
                        <Filter className="h-4 w-4" /> Filters
                        {activeFiltersCount > 0 && (
                          <Badge style={{ backgroundColor: ORBIT_RED }} className="px-1.5 py-0 text-[10px] text-white">{activeFiltersCount}</Badge>
                        )}
                      </div>
                      {showFilters ? <ChevronUp className="h-4 w-4 text-[#8A8A96]" /> : <ChevronDown className="h-4 w-4 text-[#8A8A96]" />}
                    </button>

                    {showFilters && (
                      <div className="space-y-2 border-t border-[#E4E4E8] px-3 py-3">
                        <Input
                          value={selectedGenEd}
                          onChange={(event) => setSelectedGenEd(event.target.value.toUpperCase())}
                          className="h-8 border-[#D9D9DE] bg-white text-xs"
                          placeholder="Gen-Ed (e.g. FSMA)"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={minCredits}
                            onChange={(event) => setMinCredits(Number(event.target.value) || 0)}
                            className="h-8 border-[#D9D9DE] bg-white text-xs"
                            placeholder="Min credits"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={maxCredits}
                            onChange={(event) => setMaxCredits(Number(event.target.value) || 20)}
                            className="h-8 border-[#D9D9DE] bg-white text-xs"
                            placeholder="Max credits"
                          />
                        </div>
                        <Input
                          value={instructorFilter}
                          onChange={(event) => setInstructorFilter(event.target.value)}
                          className="h-8 border-[#D9D9DE] bg-white text-xs"
                          placeholder="Instructor name"
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="open-only"
                            checked={onlyOpenSections}
                            onCheckedChange={(checked) => setOnlyOpenSections(checked === true)}
                          />
                          <Label htmlFor="open-only" className="text-xs text-[#5B5B65]">Only show open sections</Label>
                        </div>
                        {activeFiltersCount > 0 && (
                          <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={clearFilters}>
                            <X className="mr-1 h-3 w-3" /> Clear filters
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>

                  {loadError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">{loadError}</p>
                  )}

                  <ScrollArea className="h-[560px] pr-2">
                    <div className="space-y-2">
                      {isLoadingCourses && (
                        <div className="flex items-center gap-2 text-sm text-[#6B6B75]">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading courses...
                        </div>
                      )}

                      {!isLoadingCourses && filteredCourses.map((course) => {
                        const sections = sectionsByCourse[course.id] ?? [];
                        const isExpanded = expandedCourseId === course.id;

                        return (
                          <Card key={course.id} className="border-[#D9D9DE] bg-white p-3 shadow-none">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-base font-semibold text-[#1E1E24]">{course.id}</h4>
                                  <span className="text-sm font-semibold text-[#1E1E24]">Credits: {course.credits}</span>
                                </div>
                                <p className="text-sm text-[#3E3E47] leading-5">{course.title}</p>
                              </div>
                              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => void handleExpandCourse(course.id)}>
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </div>

                            {isExpanded && (
                              <div className="space-y-1 border-t border-[#EAEAF0] pt-2">
                                {loadingCourseSectionsId === course.id && (
                                  <p className="text-xs text-[#7A7A86]">Loading sections...</p>
                                )}

                                {sections.map((section) => {
                                  const isAdded = addedCourses.some((item) => item.section.id === section.id);
                                  const isConflicting = conflictingSectionIds.has(section.id);
                                  const seatsText =
                                    section.openSeats !== undefined && section.totalSeats !== undefined
                                      ? `${section.openSeats} / ${section.totalSeats} seats available`
                                      : "Seat info unavailable";

                                  return (
                                    <div key={section.id} className="rounded border border-[#E1E1E8] bg-[#FCFCFE] px-2 py-1.5">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs text-[#5B5B65]">{section.sectionCode}</p>
                                        {isConflicting && (
                                          <Badge className="border border-red-200 bg-red-50 text-[10px] text-red-600">
                                            <AlertTriangle className="mr-1 h-3 w-3" /> conflict
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-[#2D2D33]">{section.instructor || "Staff"}</p>
                                      <p className="text-xs text-[#5B5B65]">{seatsText}</p>
                                      <p className="text-xs text-[#2D2D33]">{formatMeetingSummary(section)}</p>
                                      <div className="mt-1 flex justify-end">
                                        {isAdded ? (
                                          <Button size="sm" variant="outline" className="h-6 border-[#B7D9C7] bg-[#EAF8EF] px-2 text-[10px] text-[#286C47]">
                                            Added
                                          </Button>
                                        ) : (
                                          <Button
                                            size="sm"
                                            className="h-6 px-2 text-[10px] text-white"
                                            style={{ backgroundColor: ORBIT_RED }}
                                            onClick={() => addSectionToSchedule(course, section)}
                                          >
                                            Add
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {sections.length === 0 && loadingCourseSectionsId !== course.id && (
                                  <p className="text-xs text-[#8A8A96]">No sections found for this term.</p>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </Card>

              <Card className="border-[#D9D9DE] bg-white p-0 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E8] px-4 py-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[#20202A]">{draftTitle}</h3>
                    <p className="text-xs text-[#6B6B75]">{selectedTerm?.label || "No term selected"} · Credits {totalCredits}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conflicts.length > 0 ? (
                      <Badge className="border border-red-200 bg-red-50 text-red-600">
                        <AlertTriangle className="mr-1 h-3 w-3" /> {conflicts.length} conflicts
                      </Badge>
                    ) : (
                      <Badge className="border border-green-200 bg-green-50 text-green-700">No conflicts</Badge>
                    )}
                    <Input
                      className="h-8 w-[180px] border-[#D9D9DE] bg-[#FBFBFD] text-xs"
                      value={scheduleName}
                      onChange={(event) => setScheduleName(event.target.value)}
                      placeholder="Schedule name"
                    />
                    <Button
                      size="sm"
                      className="text-white"
                      style={{ backgroundColor: ORBIT_RED }}
                      onClick={saveSchedule}
                      disabled={!scheduleName.trim() || addedCourses.length === 0}
                    >
                      <Save className="mr-1 h-3 w-3" /> Save
                    </Button>
                  </div>
                </div>

                <div className="overflow-auto px-3 py-2">
                  {addedCourses.length === 0 ? (
                    <div className="flex min-h-[560px] items-center justify-center text-sm text-[#8A8A96]">
                      Add sections from the left panel to build your timetable.
                    </div>
                  ) : (
                    <div className="grid min-w-[980px] grid-cols-[62px_repeat(5,minmax(0,1fr))]">
                      <div className="border-r border-[#ECECF1]" />
                      {calendarDays.map((day) => (
                        <div key={day.key} className="border-r border-[#ECECF1] px-2 py-1 text-center text-xs font-semibold text-[#5A5A64]">
                          {day.label}
                        </div>
                      ))}

                      <div className="relative border-r border-[#ECECF1]">
                        {hourlyLabels.map((time) => (
                          <div
                            key={time}
                            className="absolute right-2 text-[11px] font-medium text-[#73737E]"
                            style={{ top: `${((time - CALENDAR_START) / 60) * HOUR_HEIGHT - 8}px` }}
                          >
                            {formatHourLabel(time)}
                          </div>
                        ))}
                      </div>

                      {calendarDays.map((day) => (
                        <div key={day.key} className="relative border-r border-[#ECECF1]" style={{ height: `${(CALENDAR_END - CALENDAR_START) / 60 * HOUR_HEIGHT}px` }}>
                          {hourlyLabels.map((time) => (
                            <div
                              key={`${day.key}-${time}`}
                              className="absolute left-0 right-0 border-t border-[#F0F0F4]"
                              style={{ top: `${((time - CALENDAR_START) / 60) * HOUR_HEIGHT}px` }}
                            />
                          ))}

                          {calendarBlocks
                            .filter((block) => block.day === day.key)
                            .sort((a, b) => a.startMinutes - b.startMinutes)
                            .map((block, idx) => {
                              const top = ((block.startMinutes - CALENDAR_START) / 60) * HOUR_HEIGHT;
                              const height = ((block.endMinutes - block.startMinutes) / 60) * HOUR_HEIGHT;
                              const isConflicting = conflictingSectionIds.has(block.sectionId);

                              return (
                                <TooltipProvider key={`${block.sectionId}-${day.key}-${idx}`}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`absolute left-1 right-1 rounded-md border px-2 py-1 text-left shadow-sm ${block.colorClass} ${isConflicting ? "ring-2 ring-red-300" : ""}`}
                                        style={{ top: `${top}px`, height: `${Math.max(height, 34)}px` }}
                                        onClick={() => removeSectionFromSchedule(block.sectionId)}
                                      >
                                        <p className="truncate text-xs font-semibold text-[#1F1F25]">{block.code}</p>
                                        <p className="truncate text-[10px] text-[#3F3F47]">{formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}</p>
                                        {height > 52 && <p className="truncate text-[10px] text-[#555560]">{block.sectionCode}</p>}
                                        {height > 68 && block.location && <p className="truncate text-[10px] text-[#686873]">{block.location}</p>}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-sm font-semibold">{block.code}</p>
                                      <p className="text-xs text-muted-foreground">{block.sectionCode} · {formatMinutes(block.startMinutes)}-{formatMinutes(block.endMinutes)}</p>
                                      <p className="text-xs text-muted-foreground">{block.instructor || "Staff"}</p>
                                      <p className="text-xs text-muted-foreground">Click block to remove</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="view" className="space-y-3">
            <Card className="border-[#D9D9DE] bg-white p-4">
              <div className="mb-2 flex items-start gap-2 text-[#4E4E59]">
                <Info className="mt-0.5 h-4 w-4" />
                <p className="text-sm">Saved schedules are local for now; persistence hooks are available via the repository layer.</p>
              </div>
            </Card>

            {savedSchedules.map((schedule) => (
              <Card key={schedule.id} className="border-[#D9D9DE] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-[#20202A]">{schedule.name}</h4>
                    <p className="text-xs text-[#6A6A75]">{schedule.termLabel} · {new Date(schedule.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-[#D9D9DE]">{schedule.courses.length} sections</Badge>
                    <Button size="sm" variant="outline" onClick={() => loadSavedSchedule(schedule.id)}>Open</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSavedSchedules((prev) => prev.filter((item) => item.id !== schedule.id))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  {schedule.courses.map((item) => (
                    <p key={item.section.id} className="text-xs text-[#5B5B65]">
                      {item.course.id} {item.section.sectionCode} · {formatMeetingSummary(item.section)}
                    </p>
                  ))}
                </div>
              </Card>
            ))}

            {savedSchedules.length === 0 && (
              <Card className="border-[#D9D9DE] bg-white p-6 text-center text-[#7A7A86]">No schedules saved yet.</Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
