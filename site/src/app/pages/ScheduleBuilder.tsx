import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Search, Plus, Info, X, Save, Star, Calendar, Trash2, Eye, Edit2, Filter, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Link } from "react-router";

const genEdOptions = ["FSAW", "FSPW", "FSMA", "FSOC", "FSAR", "DSNL", "DSNS", "DSSP", "DSHS", "DSHU", "DVUP", "DVCC", "SCIS"];

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

function parseTimeString(timeStr: string): { days: string[]; startMin: number; endMin: number } | null {
  // Parse strings like "MWF 9:00-9:50am", "TuTh 10:00-11:15am", "TuTh 2:00-3:15pm"
  const match = timeStr.match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) return null;

  const [, dayStr, startH, startM, endH, endM, period] = match;
  
  // Parse days
  const days: string[] = [];
  let i = 0;
  while (i < dayStr.length) {
    if (i + 1 < dayStr.length && (dayStr.substring(i, i + 2) === "Tu" || dayStr.substring(i, i + 2) === "Th")) {
      days.push(dayStr.substring(i, i + 2));
      i += 2;
    } else {
      const ch = dayStr[i];
      if (ch === "M") days.push("M");
      else if (ch === "W") days.push("W");
      else if (ch === "F") days.push("F");
      i++;
    }
  }

  const isPM = period.toLowerCase() === "pm";
  
  let startHour = parseInt(startH);
  let endHour = parseInt(endH);
  
  // Convert to 24-hour format
  // For times like "2:00-3:15pm" both are PM
  // For times like "11:00-12:15pm" - 11 is AM, 12 is PM
  if (isPM) {
    if (endHour !== 12) endHour += 12;
    // Start hour: if it's less than end hour and less than 8, it's PM too
    if (startHour !== 12 && startHour < 8) startHour += 12;
    // Handle 12:xx case  
    if (startHour === 12) { /* already correct */ }
  }

  const startMin = startHour * 60 + parseInt(startM);
  const endMin = endHour * 60 + parseInt(endM);

  const dayMap: Record<string, string> = { M: "Mon", Tu: "Tue", W: "Wed", Th: "Thu", F: "Fri" };
  const mappedDays = days.map(d => dayMap[d] || d);

  return { days: mappedDays, startMin, endMin };
}

const sampleCourses = [
  {
    code: "CMSC330",
    title: "Organization of Programming Languages",
    credits: 3,
    genEds: [""],
    description: "Study of programming languages and their features",
    sections: [
      { section: "0101", time: "MWF 9:00-9:50am", instructor: "Dr. Smith", seats: "36/36" },
      { section: "0102", time: "TuTh 10:00-11:15am", instructor: "Dr. Brown", seats: "12/36" },
    ]
  },
  {
    code: "MATH340",
    title: "Multivariable Calculus",
    credits: 4,
    genEds: ["FSMA"],
    description: "Introduction to multivariable calculus",
    sections: [
      { section: "0101", time: "MWF 11:00-11:50am", instructor: "Dr. Johnson", seats: "24/36" },
      { section: "0201", time: "TuTh 11:00-12:15pm", instructor: "Dr. Taylor", seats: "5/36" },
    ]
  },
  {
    code: "PHYS375",
    title: "Introduction to Quantum Physics",
    credits: 3,
    genEds: ["DSSP"],
    description: "Quantum mechanics fundamentals",
    sections: [
      { section: "0101", time: "MWF 2:00-2:50pm", instructor: "Dr. Lee", seats: "18/36" },
    ]
  },
  {
    code: "ENGL393",
    title: "Technical Writing",
    credits: 3,
    genEds: ["FSPW"],
    description: "Professional and technical communication",
    sections: [
      { section: "0101", time: "TuTh 9:30-10:45am", instructor: "Prof. Davis", seats: "30/36" },
      { section: "0102", time: "TuTh 2:00-3:15pm", instructor: "Prof. Wilson", seats: "22/36" },
    ]
  },
  {
    code: "CMSC351",
    title: "Algorithms",
    credits: 3,
    genEds: [""],
    description: "Design and analysis of computer algorithms",
    sections: [
      { section: "0101", time: "MWF 10:00-10:50am", instructor: "Dr. Anderson", seats: "40/50" },
      { section: "0201", time: "TuTh 12:30-1:45pm", instructor: "Dr. Martinez", seats: "15/50" },
    ]
  },
];

interface ScheduleCourse {
  code: string;
  title: string;
  credits: number;
  section: string;
  time: string;
  instructor: string;
}

interface Schedule {
  id: string;
  name: string;
  term: string;
  courses: ScheduleCourse[];
  isMain: boolean;
  createdAt: Date;
}

const sampleSchedules: Schedule[] = [
  {
    id: "1",
    name: "Option A - Balanced",
    term: "Spring 2027",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", credits: 3, section: "0102", time: "TuTh 10:00-11:15am", instructor: "Dr. Brown" },
      { code: "MATH340", title: "Multivariable Calculus", credits: 4, section: "0101", time: "MWF 11:00-11:50am", instructor: "Dr. Johnson" },
      { code: "PHYS375", title: "Intro to Quantum Physics", credits: 3, section: "0101", time: "MWF 2:00-2:50pm", instructor: "Dr. Lee" },
      { code: "ENGL393", title: "Technical Writing", credits: 3, section: "0101", time: "TuTh 9:30-10:45am", instructor: "Prof. Davis" },
      { code: "CMSC351", title: "Algorithms", credits: 3, section: "0101", time: "MWF 10:00-10:50am", instructor: "Dr. Anderson" },
    ],
    isMain: true,
    createdAt: new Date("2027-01-15"),
  },
  {
    id: "2",
    name: "Option B - Morning Heavy",
    term: "Spring 2027",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", credits: 3, section: "0101", time: "MWF 9:00-9:50am", instructor: "Dr. Smith" },
      { code: "MATH340", title: "Multivariable Calculus", credits: 4, section: "0101", time: "MWF 11:00-11:50am", instructor: "Dr. Johnson" },
      { code: "ENGL393", title: "Technical Writing", credits: 3, section: "0101", time: "TuTh 9:30-10:45am", instructor: "Prof. Davis" },
      { code: "CMSC351", title: "Algorithms", credits: 3, section: "0101", time: "MWF 10:00-10:50am", instructor: "Dr. Anderson" },
    ],
    isMain: false,
    createdAt: new Date("2027-01-16"),
  },
  {
    id: "3",
    name: "Fall Plan",
    term: "Fall 2027",
    courses: [
      { code: "CMSC420", title: "Data Structures", credits: 3, section: "0101", time: "MWF 10:00-10:50am", instructor: "Dr. Adams" },
      { code: "CMSC421", title: "Operating Systems", credits: 3, section: "0101", time: "TuTh 2:00-3:15pm", instructor: "Dr. Clark" },
    ],
    isMain: true,
    createdAt: new Date("2027-08-20"),
  },
];

export default function ScheduleBuilder() {
  const [activeTab, setActiveTab] = useState<"build" | "view">("build");
  const [schedules, setSchedules] = useState<Schedule[]>(sampleSchedules);
  const [currentSchedule, setCurrentSchedule] = useState<Schedule | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"new" | "edit">("new");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [scheduleName, setScheduleName] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Spring 2027");
  const [addedCourses, setAddedCourses] = useState<ScheduleCourse[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [newTermName, setNewTermName] = useState("");
  const [showNewTermDialog, setShowNewTermDialog] = useState(false);
  const [viewingScheduleId, setViewingScheduleId] = useState<string>("");
  const [expandedSchedules, setExpandedSchedules] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [selectedGenEd, setSelectedGenEd] = useState<string>("");
  const [minCredits, setMinCredits] = useState<number>(0);
  const [maxCredits, setMaxCredits] = useState<number>(20);
  const [instructorFilter, setInstructorFilter] = useState<string>("");
  const [onlyOpenSections, setOnlyOpenSections] = useState<boolean>(false);
  
  const terms = Array.from(new Set(schedules.map(s => s.term))).sort();
  
  // Apply all filters
  const filteredCourses = sampleCourses.filter((course) => {
    // Search filter
    const matchesSearch = course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Gen Ed filter
    const matchesGenEd = !selectedGenEd || course.genEds.includes(selectedGenEd);
    
    // Credits filter
    const matchesCredits = course.credits >= minCredits && course.credits <= maxCredits;
    
    // Instructor filter (searches through all sections)
    const matchesInstructor = !instructorFilter || 
      course.sections.some(s => s.instructor.toLowerCase().includes(instructorFilter.toLowerCase()));
    
    // Open sections filter
    const matchesOpenSections = !onlyOpenSections || 
      course.sections.some(s => {
        const [current, total] = s.seats.split('/').map(Number);
        return current < total;
      });
    
    return matchesSearch && matchesGenEd && matchesCredits && matchesInstructor && matchesOpenSections;
  });

  // Count active filters
  const activeFiltersCount = 
    (selectedGenEd ? 1 : 0) +
    (minCredits > 0 ? 1 : 0) +
    (maxCredits < 20 ? 1 : 0) +
    (instructorFilter ? 1 : 0) +
    (onlyOpenSections ? 1 : 0);

  const clearFilters = () => {
    setSelectedGenEd("");
    setMinCredits(0);
    setMaxCredits(20);
    setInstructorFilter("");
    setOnlyOpenSections(false);
  };
  
  const handleModeChange = (mode: "new" | "edit") => {
    setScheduleMode(mode);
    if (mode === "new") {
      setAddedCourses([]);
      setScheduleName("");
      setSelectedScheduleId("");
    }
  };

  const handleEditSchedule = (scheduleId: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      setScheduleMode("edit");
      setSelectedScheduleId(scheduleId);
      setScheduleName(schedule.name);
      setSelectedTerm(schedule.term);
      setAddedCourses([...schedule.courses]);
    }
  };

  const handleViewSchedule = (scheduleId: string) => {
    setViewingScheduleId(scheduleId);
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      setSelectedTerm(schedule.term);
      setAddedCourses([...schedule.courses]);
      setScheduleName(schedule.name);
    }
  };

  const handleViewScheduleFromList = (scheduleId: string) => {
    handleViewSchedule(scheduleId);
    setActiveTab("build");
  };

  const handleScheduleDropdownChange = (value: string) => {
    if (value === "new") {
      setViewingScheduleId("");
      setScheduleName("");
      setAddedCourses([]);
      setScheduleMode("new");
    } else {
      setViewingScheduleId(value);
      handleViewSchedule(value);
    }
  };

  const toggleScheduleExpand = (scheduleId: string) => {
    const newExpanded = new Set(expandedSchedules);
    if (newExpanded.has(scheduleId)) {
      newExpanded.delete(scheduleId);
    } else {
      newExpanded.add(scheduleId);
    }
    setExpandedSchedules(newExpanded);
  };

  const handleLoadSchedule = () => {
    const schedule = schedules.find(s => s.id === selectedScheduleId);
    if (schedule) {
      setScheduleName(schedule.name);
      setSelectedTerm(schedule.term);
      setAddedCourses([...schedule.courses]);
    }
  };

  const addCourseToSchedule = (course: any, section: any) => {
    const newCourse: ScheduleCourse = {
      code: course.code,
      title: course.title,
      credits: course.credits,
      section: section.section,
      time: section.time,
      instructor: section.instructor,
    };
    setAddedCourses([...addedCourses, newCourse]);
    setSelectedCourse(null);
  };

  const removeCourse = (index: number) => {
    setAddedCourses(addedCourses.filter((_, i) => i !== index));
  };

  const saveSchedule = () => {
    if (!scheduleName.trim()) {
      alert("Please enter a schedule name");
      return;
    }

    if (scheduleMode === "edit" && selectedScheduleId) {
      // Update existing schedule
      setSchedules(schedules.map(s => 
        s.id === selectedScheduleId 
          ? { ...s, name: scheduleName, term: selectedTerm, courses: addedCourses }
          : s
      ));
      alert(`Schedule "${scheduleName}" updated successfully!`);
    } else {
      // Create new schedule
      const newSchedule: Schedule = {
        id: Date.now().toString(),
        name: scheduleName,
        term: selectedTerm,
        courses: addedCourses,
        isMain: schedules.filter(s => s.term === selectedTerm).length === 0,
        createdAt: new Date(),
      };
      setSchedules([...schedules, newSchedule]);
      alert(`Schedule "${scheduleName}" saved successfully!`);
    }

    // Reset form
    setScheduleName("");
    setAddedCourses([]);
    setScheduleMode("new");
    setSelectedScheduleId("");
  };

  const setMainSchedule = (scheduleId: string) => {
    setSchedules(schedules.map(s => ({
      ...s,
      isMain: s.id === scheduleId ? true : (s.term === schedules.find(x => x.id === scheduleId)?.term ? false : s.isMain)
    })));
  };

  const deleteSchedule = (scheduleId: string) => {
    if (confirm("Are you sure you want to delete this schedule?")) {
      setSchedules(schedules.filter(s => s.id !== scheduleId));
    }
  };

  const addNewTerm = () => {
    if (newTermName.trim()) {
      setSelectedTerm(newTermName);
      setShowNewTermDialog(false);
      setNewTermName("");
    }
  };

  const totalCredits = addedCourses.reduce((sum, course) => sum + course.credits, 0);

  const schedulesByTerm = terms.map(term => ({
    term,
    schedules: schedules.filter(s => s.term === term)
  }));

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">Schedule Builder</h1>
          <p className="text-neutral-400">
            Create and manage multiple schedule options for each semester
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="space-y-6">
          <TabsList className="bg-[#252525] border border-neutral-800">
            <TabsTrigger value="build" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Edit2 className="w-4 h-4 mr-2" />
              Build Schedules
            </TabsTrigger>
            <TabsTrigger value="view" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Eye className="w-4 h-4 mr-2" />
              View All Schedules
            </TabsTrigger>
          </TabsList>

          {/* BUILD SCHEDULES TAB */}
          <TabsContent value="build">
            {/* Schedule Selector Header */}
            <Card className="p-4 bg-[#252525] border-neutral-800 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white text-sm">Schedule:</h3>
                    <Select value={viewingScheduleId || "new"} onValueChange={handleScheduleDropdownChange}>
                      <SelectTrigger className="bg-[#1a1a1a] border-neutral-700 w-[250px]">
                        <SelectValue placeholder="Create New Schedule" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">+ Create New Schedule</SelectItem>
                        {schedules.map(schedule => (
                          <SelectItem key={schedule.id} value={schedule.id}>
                            {schedule.name} ({schedule.term})
                            {schedule.isMain && " ⭐"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                      placeholder="Schedule name..."
                      className="bg-[#1a1a1a] border-neutral-700 w-[180px] h-9"
                    />
                    <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                      <SelectTrigger className="bg-[#1a1a1a] border-neutral-700 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map(term => (
                          <SelectItem key={term} value={term}>{term}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-neutral-700">
                    {addedCourses.length} courses
                  </Badge>
                  <Badge variant="outline" className="border-neutral-700">
                    {totalCredits} credits
                  </Badge>
                  <Button
                    onClick={saveSchedule}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700"
                    disabled={addedCourses.length === 0 || !scheduleName.trim()}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {scheduleMode === "edit" ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex gap-6" style={{ minHeight: "calc(100vh - 320px)" }}>
              {/* Left Panel - Course Search & Filters */}
              <div className="w-[380px] flex-shrink-0 flex flex-col gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <Input
                    placeholder="Search by course code or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-[#252525] border-neutral-700 pl-10"
                  />
                </div>

                {/* Filters Toggle */}
                <Card className="bg-[#252525] border-neutral-800">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-[#2a2a2a] transition-colors rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-300">Filters</span>
                      {activeFiltersCount > 0 && (
                        <Badge className="bg-red-600 text-white text-xs px-1.5 py-0">
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </div>
                    {showFilters ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>

                  {showFilters && (
                    <div className="px-3 pb-3 space-y-3 border-t border-neutral-800 pt-3">
                      {/* Gen-Ed Select */}
                      <div>
                        <Label className="text-xs text-neutral-400 mb-1 block">Gen-Ed Category</Label>
                        <Select value={selectedGenEd || "all"} onValueChange={(v) => setSelectedGenEd(v === "all" ? "" : v)}>
                          <SelectTrigger className="bg-[#1a1a1a] border-neutral-700 h-8 text-sm">
                            <SelectValue placeholder="Any Gen-Ed" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Any Gen-Ed</SelectItem>
                            {genEdOptions.map(ge => (
                              <SelectItem key={ge} value={ge}>{ge}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Credits Range */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-neutral-400 mb-1 block">Min Credits</Label>
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={minCredits || ""}
                            onChange={(e) => setMinCredits(Number(e.target.value) || 0)}
                            className="bg-[#1a1a1a] border-neutral-700 h-8 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-neutral-400 mb-1 block">Max Credits</Label>
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            value={maxCredits >= 20 ? "" : maxCredits}
                            onChange={(e) => setMaxCredits(Number(e.target.value) || 20)}
                            className="bg-[#1a1a1a] border-neutral-700 h-8 text-sm"
                            placeholder="20"
                          />
                        </div>
                      </div>

                      {/* Instructor */}
                      <div>
                        <Label className="text-xs text-neutral-400 mb-1 block">Instructor Name</Label>
                        <Input
                          value={instructorFilter}
                          onChange={(e) => setInstructorFilter(e.target.value)}
                          placeholder="e.g., Dr. Smith"
                          className="bg-[#1a1a1a] border-neutral-700 h-8 text-sm"
                        />
                      </div>

                      {/* Only Open Sections */}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="openSections"
                          checked={onlyOpenSections}
                          onCheckedChange={(checked) => setOnlyOpenSections(checked === true)}
                          className="border-neutral-600"
                        />
                        <Label htmlFor="openSections" className="text-sm text-neutral-300 cursor-pointer">
                          Only show open sections
                        </Label>
                      </div>

                      {/* Clear Filters */}
                      {activeFiltersCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                          className="w-full text-neutral-400 hover:text-white hover:bg-neutral-800"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  )}
                </Card>

                {/* Course Results Count */}
                <div className="text-xs text-neutral-500 px-1">
                  {filteredCourses.length} course{filteredCourses.length !== 1 ? "s" : ""} found
                </div>

                {/* Course Results List */}
                <ScrollArea className="flex-1" style={{ maxHeight: "calc(100vh - 520px)" }}>
                  <div className="space-y-2 pr-2">
                    {filteredCourses.map((course) => (
                      <Card
                        key={course.code}
                        className="p-3 bg-[#252525] border-neutral-800 hover:border-neutral-700 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-white text-sm">{course.code}</h4>
                              <Badge className="bg-red-600/20 text-red-400 border border-red-600/30 text-xs shrink-0">
                                {course.credits}cr
                              </Badge>
                              {course.genEds[0] && (
                                <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs shrink-0">
                                  {course.genEds[0]}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 truncate">{course.title}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedCourse(selectedCourse?.code === course.code ? null : course)}
                            className="text-neutral-400 hover:text-white h-7 px-2 shrink-0"
                          >
                            {selectedCourse?.code === course.code ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        {selectedCourse?.code === course.code && (
                          <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                            {course.sections.map((section) => {
                              const isFull = (() => {
                                const [current, total] = section.seats.split('/').map(Number);
                                return current >= total;
                              })();
                              const isAdded = addedCourses.some(
                                c => c.code === course.code && c.section === section.section
                              );
                              return (
                                <div
                                  key={section.section}
                                  className={`flex items-center justify-between p-2 rounded border text-xs ${
                                    isAdded
                                      ? "bg-green-600/10 border-green-600/30"
                                      : "bg-[#1a1a1a] border-neutral-800"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-white">
                                      {section.section} &middot; {section.time}
                                    </p>
                                    <p className="text-neutral-500">
                                      {section.instructor} &middot;{" "}
                                      <span className={isFull ? "text-red-400" : "text-green-400"}>
                                        {section.seats}
                                      </span>
                                    </p>
                                  </div>
                                  {isAdded ? (
                                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs shrink-0">
                                      Added
                                    </Badge>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => addCourseToSchedule(course, section)}
                                      className="bg-green-600 hover:bg-green-700 h-7 px-2 shrink-0"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Add
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    ))}

                    {filteredCourses.length === 0 && (
                      <div className="text-center py-8">
                        <Search className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                        <p className="text-sm text-neutral-500">No courses match your search</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Panel - Weekly Calendar */}
              <div className="flex-1 min-w-0">
                <Card className="bg-[#252525] border-neutral-800 h-full flex flex-col">
                  {/* Calendar Header */}
                  <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-400" />
                      <h3 className="text-white">Weekly Schedule</h3>
                    </div>
                    {addedCourses.length > 0 && (
                      <p className="text-xs text-neutral-500">
                        Click a course block to remove it
                      </p>
                    )}
                  </div>

                  {/* Calendar Grid */}
                  <div className="flex-1 overflow-auto p-2">
                    {addedCourses.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                        <Calendar className="w-12 h-12 text-neutral-700 mb-3" />
                        <p className="text-neutral-500 text-sm mb-1">No courses added yet</p>
                        <p className="text-neutral-600 text-xs">Search and add courses from the left panel</p>
                      </div>
                    ) : (
                      (() => {
                        const CALENDAR_START = 8 * 60;
                        const CALENDAR_END = 18 * 60;
                        const HOUR_HEIGHT = 60;
                        const totalMinutes = CALENDAR_END - CALENDAR_START;
                        const totalHeight = (totalMinutes / 60) * HOUR_HEIGHT;
                        const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
                        const hours = Array.from({ length: (CALENDAR_END - CALENDAR_START) / 60 }, (_, i) => {
                          const hour = CALENDAR_START / 60 + i;
                          const ampm = hour >= 12 ? "PM" : "AM";
                          const display = hour > 12 ? hour - 12 : hour;
                          return `${display}${ampm}`;
                        });

                        const courseColorMap: Record<string, typeof courseColors[0]> = {};
                        const uniqueCodes = Array.from(new Set(addedCourses.map(c => c.code)));
                        uniqueCodes.forEach((code, idx) => {
                          courseColorMap[code] = courseColors[idx % courseColors.length];
                        });

                        const calendarBlocks = addedCourses.flatMap((course, courseIdx) => {
                          const parsed = parseTimeString(course.time);
                          if (!parsed) return [];
                          return parsed.days.map(day => ({
                            ...course,
                            courseIndex: courseIdx,
                            day,
                            startMin: parsed.startMin,
                            endMin: parsed.endMin,
                            color: courseColorMap[course.code],
                          }));
                        });

                        return (
                          <div className="flex" style={{ minHeight: totalHeight + 32 }}>
                            {/* Time axis */}
                            <div className="w-14 flex-shrink-0 relative" style={{ height: totalHeight, marginTop: 32 }}>
                              {hours.map((label, i) => (
                                <div
                                  key={label}
                                  className="absolute text-xs text-neutral-500 text-right w-12"
                                  style={{ top: i * HOUR_HEIGHT - 6 }}
                                >
                                  {label}
                                </div>
                              ))}
                            </div>

                            {/* Day columns */}
                            <div className="flex-1 flex">
                              {days.map(day => (
                                <div key={day} className="flex-1 min-w-0 relative">
                                  {/* Day header */}
                                  <div className="h-8 flex items-center justify-center text-xs text-neutral-400 border-b border-neutral-700 sticky top-0 bg-[#252525] z-10">
                                    {day}
                                  </div>

                                  {/* Grid lines and blocks */}
                                  <div
                                    className="relative border-l border-neutral-800"
                                    style={{ height: totalHeight }}
                                  >
                                    {/* Hour lines */}
                                    {hours.map((_, i) => (
                                      <div
                                        key={i}
                                        className="absolute w-full border-t border-neutral-800/60"
                                        style={{ top: i * HOUR_HEIGHT }}
                                      />
                                    ))}

                                    {/* Half-hour lines */}
                                    {hours.map((_, i) => (
                                      <div
                                        key={`half-${i}`}
                                        className="absolute w-full border-t border-neutral-800/30 border-dashed"
                                        style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                                      />
                                    ))}

                                    {/* Course blocks */}
                                    {calendarBlocks
                                      .filter(b => b.day === day)
                                      .map((block, bIdx) => {
                                        const top = ((block.startMin - CALENDAR_START) / 60) * HOUR_HEIGHT;
                                        const height = ((block.endMin - block.startMin) / 60) * HOUR_HEIGHT;
                                        return (
                                          <TooltipProvider key={`${block.code}-${block.section}-${bIdx}`}>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  onClick={() => removeCourse(block.courseIndex)}
                                                  className={`absolute left-0.5 right-0.5 rounded px-1.5 py-1 border cursor-pointer overflow-hidden transition-opacity hover:opacity-80 text-left ${block.color.bg} ${block.color.border}`}
                                                  style={{ top, height, minHeight: 20 }}
                                                >
                                                  <p className={`text-xs truncate ${block.color.text}`}>
                                                    {block.code}
                                                  </p>
                                                  {height > 35 && (
                                                    <p className="text-[10px] text-neutral-400 truncate">
                                                      {block.section}
                                                    </p>
                                                  )}
                                                  {height > 50 && (
                                                    <p className="text-[10px] text-neutral-500 truncate">
                                                      {block.instructor}
                                                    </p>
                                                  )}
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent side="right" className="max-w-[200px]">
                                                <p className="text-sm">{block.code} - {block.title}</p>
                                                <p className="text-xs text-neutral-400">{block.section} &middot; {block.time}</p>
                                                <p className="text-xs text-neutral-400">{block.instructor} &middot; {block.credits}cr</p>
                                                <p className="text-xs text-neutral-500 mt-1">Click to remove</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* VIEW ALL SCHEDULES TAB */}
          <TabsContent value="view">
            <div className="space-y-6">
              {/* Info Card */}
              <Card className="p-4 bg-blue-600/10 border border-blue-600/30">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-blue-400 mb-2">
                      <strong>How Schedule Management Works:</strong>
                    </p>
                    <ul className="text-xs text-blue-400/80 space-y-1 list-disc list-inside">
                      <li><strong>MAIN Schedule:</strong> The schedule marked with ⭐ appears in your Four-Year Plan and Degree Audit</li>
                      <li><strong>Alternative Schedules:</strong> Create multiple schedule options to compare different course combinations</li>
                      <li><strong>Quick Actions:</strong> Click schedule names to view details, star icon to set as main, or edit to modify</li>
                    </ul>
                  </div>
                </div>
              </Card>

              {/* Controls */}
              <div className="flex justify-between items-center">
                <h2 className="text-2xl text-white">All Schedules by Term</h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    onClick={() => setShowNewTermDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Term
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => setActiveTab("build")}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Schedule
                  </Button>
                </div>
              </div>

              {/* Schedules Grouped by Term */}
              {schedulesByTerm.length === 0 ? (
                <Card className="p-12 bg-[#252525] border-neutral-800 text-center">
                  <Calendar className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
                  <p className="text-neutral-400 mb-4">No schedules created yet</p>
                  <Button
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => setActiveTab("build")}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Schedule
                  </Button>
                </Card>
              ) : (
                schedulesByTerm.map(({ term, schedules: termSchedules }) => (
                  <Card key={term} className="p-6 bg-[#252525] border-neutral-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl text-white">{term}</h3>
                      <Badge variant="outline" className="border-neutral-700">
                        {termSchedules.length} {termSchedules.length === 1 ? "schedule" : "schedules"}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {termSchedules.map((schedule) => (
                        <Card
                          key={schedule.id}
                          className={`bg-[#1a1a1a] border-2 transition-all ${
                            schedule.isMain 
                              ? "border-amber-600/50 bg-gradient-to-r from-amber-900/10 to-[#1a1a1a]" 
                              : "border-neutral-800 hover:border-neutral-700"
                          }`}
                        >
                          <div
                            className="p-3 cursor-pointer"
                            onClick={() => toggleScheduleExpand(schedule.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-white text-base">{schedule.name}</h4>
                                  {schedule.isMain && (
                                    <Badge className="bg-amber-600/20 text-amber-400 border border-amber-600/30 text-xs">
                                      <Star className="w-3 h-3 mr-1 fill-amber-400" />
                                      MAIN
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className="border-neutral-700 text-xs">
                                    {schedule.courses.length} courses
                                  </Badge>
                                  <Badge variant="outline" className="border-neutral-700 text-xs">
                                    {schedule.courses.reduce((sum, c) => sum + c.credits, 0)} credits
                                  </Badge>
                                  {schedule.courses.slice(0, 2).map((course, idx) => (
                                    <Badge key={idx} className="bg-red-600/20 text-red-400 border border-red-600/30 text-xs">
                                      {course.code}
                                    </Badge>
                                  ))}
                                  {schedule.courses.length > 2 && (
                                    <Badge className="bg-neutral-700 text-neutral-300 text-xs">
                                      +{schedule.courses.length - 2} more
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleViewScheduleFromList(schedule.id)}
                                        className="border-blue-700 text-blue-400 hover:bg-blue-600/20"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View schedule</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                {!schedule.isMain && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setMainSchedule(schedule.id)}
                                          className="border-amber-700 text-amber-400 hover:bg-amber-600/20"
                                        >
                                          <Star className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Set as MAIN schedule</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          handleEditSchedule(schedule.id);
                                          setActiveTab("build");
                                        }}
                                        className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Edit schedule</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => deleteSchedule(schedule.id)}
                                        className="border-red-700 text-red-400 hover:bg-red-600/20"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete schedule</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Course List */}
                          {expandedSchedules.has(schedule.id) && (
                            <div className="px-3 pb-3 pt-0 border-t border-neutral-800 mt-2">
                              <div className="mt-3 space-y-2">
                                {schedule.courses.map((course, idx) => (
                                  <div key={idx} className="text-sm p-2 bg-[#252525] rounded">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <span className="text-white">{course.code}</span>
                                        <span className="text-neutral-500 mx-2">•</span>
                                        <span className="text-neutral-400">{course.title}</span>
                                      </div>
                                      <Badge variant="outline" className="border-neutral-700 text-xs">
                                        {course.credits}cr
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-1">
                                      {course.section} • {course.time} • {course.instructor}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>

                    <div className="mt-4 p-3 bg-neutral-900/50 rounded-lg border border-neutral-800">
                      <p className="text-xs text-neutral-400">
                        💡 <strong>Tip:</strong> The MAIN schedule for {term} appears in your{" "}
                        <Link to="/four-year-plan" className="text-blue-400 hover:underline">
                          Four-Year Plan
                        </Link>
                        {" "}and{" "}
                        <Link to="/degree-audit" className="text-blue-400 hover:underline">
                          Degree Audit
                        </Link>
                      </p>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New Term Dialog */}
      {showNewTermDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewTermDialog(false)}>
          <Card className="max-w-md w-full p-6 bg-[#252525] border-neutral-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl text-white mb-4">Add New Term</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-neutral-300 mb-2 block">Term Name</Label>
                <Input
                  value={newTermName}
                  onChange={(e) => setNewTermName(e.target.value)}
                  placeholder="e.g., Fall 2027, Spring 2028"
                  className="bg-[#1a1a1a] border-neutral-700"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={addNewTerm} className="flex-1 bg-red-600 hover:bg-red-700">
                  Add Term
                </Button>
                <Button onClick={() => setShowNewTermDialog(false)} variant="outline" className="flex-1 border-neutral-700">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}