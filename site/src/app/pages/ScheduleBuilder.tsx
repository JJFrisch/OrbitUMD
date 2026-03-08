import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
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

const courseColors = [
  { bg: "bg-red-600/30", border: "border-red-500/50", text: "text-red-300" },
  { bg: "bg-blue-600/30", border: "border-blue-500/50", text: "text-blue-300" },
  { bg: "bg-green-600/30", border: "border-green-500/50", text: "text-green-300" },
  { bg: "bg-amber-600/30", border: "border-amber-500/50", text: "text-amber-300" },
  { bg: "bg-purple-600/30", border: "border-purple-500/50", text: "text-purple-300" },
  { bg: "bg-pink-600/30", border: "border-pink-500/50", text: "text-pink-300" },
  { bg: "bg-cyan-600/30", border: "border-cyan-500/50", text: "text-cyan-300" },
  { bg: "bg-orange-600/30", border: "border-orange-500/50", text: "text-orange-300" },
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
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${ampm}`;
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

  const [scheduleName, setScheduleName] = useState("");
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
    if (!selectedTermCode) {
      return;
    }

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
        if (active) {
          setIsLoadingCourses(false);
        }
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
      if (course.credits < minCredits || course.credits > maxCredits) {
        return false;
      }

      const sections = sectionsByCourse[course.id] ?? [];

      if (instructorFilter && sections.length > 0) {
        const hasInstructor = sections.some((section) =>
          (section.instructor ?? "").toLowerCase().includes(instructorFilter.toLowerCase())
        );
        if (!hasInstructor) {
          return false;
        }
      }

      if (onlyOpenSections && sections.length > 0) {
        const hasOpen = sections.some(
          (section) => (section.openSeats ?? 0) > 0 && (section.totalSeats ?? 0) > 0
        );
        if (!hasOpen) {
          return false;
        }
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

    if (!nextId || sectionsByCourse[courseId]) {
      return;
    }

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
      if (exists) {
        return prev;
      }

      return [...prev, { course, section }];
    });
  }

  function removeSectionFromSchedule(sectionId: string) {
    setAddedCourses((prev) => prev.filter((item) => item.section.id !== sectionId));
  }

  function saveSchedule() {
    if (!scheduleName.trim() || !selectedTerm) {
      return;
    }

    const next: SavedSchedule = {
      id: String(Date.now()),
      name: scheduleName.trim(),
      termCode: selectedTerm.code,
      termLabel: selectedTerm.label,
      courses: addedCourses,
      createdAt: new Date().toISOString(),
    };

    setSavedSchedules((prev) => [next, ...prev]);
    setScheduleName("");
    setAddedCourses([]);
  }

  function clearFilters() {
    setSelectedGenEd("");
    setMinCredits(0);
    setMaxCredits(20);
    setInstructorFilter("");
    setOnlyOpenSections(false);
  }

  const calendarBlocks = useMemo(() => {
    return addedCourses.flatMap((item, courseIndex) => {
      const color = courseColors[courseIndex % courseColors.length];

      return item.section.meetings.flatMap((meeting) =>
        meeting.days.map((day) => ({
          day,
          startMinutes: meeting.startMinutes,
          endMinutes: meeting.endMinutes,
          sectionId: item.section.id,
          code: item.course.id,
          sectionCode: item.section.sectionCode,
          instructor: item.section.instructor,
          label: item.course.title,
          color,
        }))
      );
    });
  }, [addedCourses]);

  const calendarDays: Array<{ key: "M" | "Tu" | "W" | "Th" | "F"; label: string }> = [
    { key: "M", label: "Mon" },
    { key: "Tu", label: "Tue" },
    { key: "W", label: "Wed" },
    { key: "Th", label: "Thu" },
    { key: "F", label: "Fri" },
  ];

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="mb-2 text-4xl text-white">Schedule Builder</h1>
          <p className="text-neutral-400">Live UMD API-backed planner with conflict detection.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "build" | "view")}> 
          <TabsList className="border border-neutral-800 bg-[#252525]">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="view">
              <Eye className="mr-2 h-4 w-4" />
              Saved Schedules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="space-y-6">
            <Card className="border-neutral-800 bg-[#252525] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <Label className="mb-1 block text-xs text-neutral-400">Term</Label>
                  <Select value={selectedTermCode} onValueChange={setSelectedTermCode}>
                    <SelectTrigger className="border-neutral-700 bg-[#1a1a1a]">
                      <SelectValue placeholder={isLoadingTerms ? "Loading terms..." : "Pick a term"} />
                    </SelectTrigger>
                    <SelectContent>
                      {terms.map((term) => (
                        <SelectItem key={term.code} value={term.code}>
                          {term.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[240px] flex-1">
                  <Label className="mb-1 block text-xs text-neutral-400">Schedule Name</Label>
                  <Input
                    className="border-neutral-700 bg-[#1a1a1a]"
                    value={scheduleName}
                    onChange={(event) => setScheduleName(event.target.value)}
                    placeholder="My Fall schedule"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Badge variant="outline" className="border-neutral-700">{addedCourses.length} sections</Badge>
                  <Badge variant="outline" className="border-neutral-700">{totalCredits} credits</Badge>
                  {conflicts.length > 0 && (
                    <Badge className="border border-red-600/40 bg-red-600/20 text-red-300">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {conflicts.length} conflicts
                    </Badge>
                  )}
                  <Button
                    onClick={saveSchedule}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={!scheduleName.trim() || addedCourses.length === 0}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
              {loadError && <p className="mt-2 text-xs text-red-400">{loadError}</p>}
            </Card>

            <div className="flex gap-6">
              <div className="w-[380px] flex-shrink-0 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <Input
                    className="border-neutral-700 bg-[#252525] pl-10"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by course id or title"
                  />
                </div>

                <Card className="border-neutral-800 bg-[#252525]">
                  <button
                    className="flex w-full items-center justify-between p-3 text-left"
                    onClick={() => setShowFilters((value) => !value)}
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-neutral-400" />
                      <span className="text-sm text-neutral-300">Filters</span>
                      {activeFiltersCount > 0 && (
                        <Badge className="bg-red-600 px-1.5 py-0 text-xs text-white">{activeFiltersCount}</Badge>
                      )}
                    </div>
                    {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showFilters && (
                    <div className="space-y-3 border-t border-neutral-800 px-3 pb-3 pt-3">
                      <div>
                        <Label className="mb-1 block text-xs text-neutral-400">Gen Ed</Label>
                        <Input
                          value={selectedGenEd}
                          onChange={(event) => setSelectedGenEd(event.target.value.toUpperCase())}
                          className="h-8 border-neutral-700 bg-[#1a1a1a]"
                          placeholder="e.g. FSMA"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          value={minCredits}
                          onChange={(event) => setMinCredits(Number(event.target.value) || 0)}
                          className="h-8 border-neutral-700 bg-[#1a1a1a]"
                          placeholder="Min credits"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          value={maxCredits}
                          onChange={(event) => setMaxCredits(Number(event.target.value) || 20)}
                          className="h-8 border-neutral-700 bg-[#1a1a1a]"
                          placeholder="Max credits"
                        />
                      </div>
                      <Input
                        value={instructorFilter}
                        onChange={(event) => setInstructorFilter(event.target.value)}
                        className="h-8 border-neutral-700 bg-[#1a1a1a]"
                        placeholder="Instructor contains..."
                      />
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="open-sections"
                          checked={onlyOpenSections}
                          onCheckedChange={(checked) => setOnlyOpenSections(checked === true)}
                        />
                        <Label htmlFor="open-sections" className="text-xs text-neutral-300">Only open sections</Label>
                      </div>
                      {activeFiltersCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                          <X className="mr-1 h-3 w-3" />
                          Clear filters
                        </Button>
                      )}
                    </div>
                  )}
                </Card>

                <ScrollArea className="h-[600px] pr-2">
                  <div className="space-y-2">
                    {isLoadingCourses && (
                      <div className="flex items-center gap-2 text-sm text-neutral-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading courses...
                      </div>
                    )}

                    {!isLoadingCourses && filteredCourses.map((course) => {
                      const sections = sectionsByCourse[course.id] ?? [];
                      const isExpanded = expandedCourseId === course.id;

                      return (
                        <Card key={course.id} className="border-neutral-800 bg-[#252525] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="mb-1 flex items-center gap-2">
                                <h4 className="text-sm text-white">{course.id}</h4>
                                <Badge className="border border-red-600/30 bg-red-600/20 text-xs text-red-400">
                                  {course.credits}cr
                                </Badge>
                                {course.genEdTags[0] && (
                                  <Badge className="border border-blue-600/30 bg-blue-600/20 text-xs text-blue-400">
                                    {course.genEdTags[0]}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-neutral-400">{course.title}</p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => void handleExpandCourse(course.id)}>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 space-y-2 border-t border-neutral-800 pt-2">
                              {loadingCourseSectionsId === course.id && (
                                <div className="flex items-center gap-2 text-xs text-neutral-400">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Loading sections...
                                </div>
                              )}

                              {sections.map((section) => {
                                const isAdded = addedCourses.some((item) => item.section.id === section.id);
                                const isConflicting = conflictingSectionIds.has(section.id);
                                const seatsText =
                                  section.openSeats !== undefined && section.totalSeats !== undefined
                                    ? `${section.openSeats}/${section.totalSeats}`
                                    : "N/A";

                                return (
                                  <div
                                    key={section.id}
                                    className={`rounded border p-2 text-xs ${
                                      isConflicting
                                        ? "border-red-600/40 bg-red-600/10"
                                        : "border-neutral-800 bg-[#1a1a1a]"
                                    }`}
                                  >
                                    <p className="text-white">
                                      {section.sectionCode} · {formatMeetingSummary(section)}
                                    </p>
                                    <p className="text-neutral-400">
                                      {section.instructor || "Staff"} · Seats {seatsText}
                                    </p>
                                    <div className="mt-2 flex items-center justify-between">
                                      {isConflicting && (
                                        <Badge className="border border-red-600/40 bg-red-600/20 text-red-300">
                                          Conflict
                                        </Badge>
                                      )}
                                      {isAdded ? (
                                        <Badge className="border border-green-600/40 bg-green-600/20 text-green-300">Added</Badge>
                                      ) : (
                                        <Button
                                          size="sm"
                                          className="h-7 bg-green-600 px-2 hover:bg-green-700"
                                          onClick={() => addSectionToSchedule(course, section)}
                                        >
                                          <Plus className="mr-1 h-3 w-3" /> Add
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {sections.length === 0 && loadingCourseSectionsId !== course.id && (
                                <p className="text-xs text-neutral-500">No sections returned for this term.</p>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="min-w-0 flex-1">
                <Card className="flex h-full flex-col border-neutral-800 bg-[#252525]">
                  <div className="flex items-center justify-between border-b border-neutral-800 p-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-400" />
                      <h3 className="text-white">Weekly Calendar</h3>
                    </div>
                    {conflicts.length > 0 ? (
                      <Badge className="border border-red-600/40 bg-red-600/20 text-red-300">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Conflicts detected
                      </Badge>
                    ) : (
                      <Badge className="border border-green-600/40 bg-green-600/20 text-green-300">No conflicts</Badge>
                    )}
                  </div>

                  <div className="flex-1 overflow-auto p-3">
                    {addedCourses.length === 0 ? (
                      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
                        <Calendar className="mb-3 h-10 w-10 text-neutral-700" />
                        <p className="text-sm text-neutral-500">Add sections to see your timetable.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {addedCourses.map((item) => (
                            <div key={item.section.id} className="flex items-center justify-between rounded border border-neutral-800 bg-[#1a1a1a] p-2">
                              <div>
                                <p className="text-sm text-white">{item.course.id} · {item.section.sectionCode}</p>
                                <p className="text-xs text-neutral-400">{formatMeetingSummary(item.section)}</p>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => removeSectionFromSchedule(item.section.id)}>
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-5 gap-2">
                          {calendarDays.map((day) => (
                            <div key={day.key} className="rounded border border-neutral-800 bg-[#1a1a1a] p-2">
                              <p className="mb-2 text-center text-xs text-neutral-400">{day.label}</p>
                              <div className="space-y-1">
                                {calendarBlocks
                                  .filter((block) => block.day === day.key)
                                  .sort((a, b) => a.startMinutes - b.startMinutes)
                                  .map((block) => (
                                    <TooltipProvider key={`${block.sectionId}-${block.day}-${block.startMinutes}`}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`rounded border px-2 py-1 text-xs ${block.color.bg} ${
                                              conflictingSectionIds.has(block.sectionId)
                                                ? "border-red-500"
                                                : block.color.border
                                            }`}
                                          >
                                            <p className={block.color.text}>{block.code}</p>
                                            <p className="text-[10px] text-neutral-400">
                                              {formatMinutes(block.startMinutes)}-{formatMinutes(block.endMinutes)}
                                            </p>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-sm">{block.code} · {block.sectionCode}</p>
                                          <p className="text-xs text-neutral-400">{block.label}</p>
                                          <p className="text-xs text-neutral-400">{block.instructor || "Staff"}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="view" className="space-y-3">
            <Card className="border-blue-600/30 bg-blue-600/10 p-4">
              <div className="flex items-start gap-2 text-blue-300">
                <Info className="mt-0.5 h-4 w-4" />
                <p className="text-sm">Saved schedules are currently local in-memory; Supabase persistence is added in repository APIs for next integration pass.</p>
              </div>
            </Card>

            {savedSchedules.map((schedule) => (
              <Card key={schedule.id} className="border-neutral-800 bg-[#252525] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h4 className="text-white">{schedule.name}</h4>
                    <p className="text-xs text-neutral-400">{schedule.termLabel} · {new Date(schedule.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant="outline" className="border-neutral-700">{schedule.courses.length} sections</Badge>
                </div>
                <div className="space-y-1">
                  {schedule.courses.map((item) => (
                    <p key={item.section.id} className="text-xs text-neutral-400">
                      {item.course.id} {item.section.sectionCode} · {formatMeetingSummary(item.section)}
                    </p>
                  ))}
                </div>
              </Card>
            ))}

            {savedSchedules.length === 0 && (
              <Card className="border-neutral-800 bg-[#252525] p-6 text-center text-neutral-500">
                No schedules saved yet.
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
