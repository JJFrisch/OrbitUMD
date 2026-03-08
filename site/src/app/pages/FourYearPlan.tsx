import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Plus, Info, Calendar, GraduationCap, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
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

const semesters = [
  {
    term: "Fall 2025",
    credits: 18,
    status: "completed",
    courses: [
      { code: "CMSC131", title: "Object-Oriented Programming I", credits: 4, tags: ["Major"], status: "completed" },
      { code: "MATH140", title: "Calculus I", credits: 4, tags: ["FSMA", "Major"], status: "completed" },
      { code: "COMM107", title: "Oral Communication", credits: 3, tags: ["FSOC"], status: "completed" },
      { code: "ENGL101", title: "Academic Writing", credits: 3, tags: ["FSAW"], status: "completed" },
      { code: "UNIV100", title: "First Year Experience", credits: 1, tags: [], status: "completed" }
    ]
  },
  {
    term: "Spring 2026",
    credits: 17,
    status: "completed",
    courses: [
      { code: "CMSC132", title: "Object-Oriented Programming II", credits: 4, tags: ["Major"], status: "completed" },
      { code: "MATH141", title: "Calculus II", credits: 4, tags: ["Major"], status: "completed" },
      { code: "MUSC204", title: "Music in Black America", credits: 3, tags: ["DSHU", "DVUP"], status: "completed" },
      { code: "HISP200", title: "Hispanic Culture", credits: 3, tags: ["DSHU", "DVUP", "SCIS"], status: "completed" },
      { code: "PHYS161", title: "General Physics I", credits: 3, tags: ["Minor"], status: "completed" }
    ]
  },
  {
    term: "Fall 2026",
    credits: 16,
    status: "completed",
    courses: [
      { code: "CMSC216", title: "Computer Systems", credits: 4, tags: ["Major"], status: "completed" },
      { code: "CMSC250", title: "Discrete Structures", credits: 4, tags: ["Major"], status: "completed" },
      { code: "MATH240", title: "Linear Algebra", credits: 4, tags: ["Major"], status: "completed" },
      { code: "PHYS260", title: "General Physics II", credits: 4, tags: ["Minor"], status: "completed" }
    ]
  },
  {
    term: "Spring 2027",
    credits: 16,
    status: "current",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", credits: 3, tags: ["Major"], status: "in-progress" },
      { code: "MATH340", title: "Multivariable Calculus", credits: 4, tags: ["Major"], status: "in-progress" },
      { code: "PHYS375", title: "Intro to Quantum Physics", credits: 3, tags: ["Minor", "DSSP"], status: "in-progress" },
      { code: "ENGL393", title: "Technical Writing", credits: 3, tags: ["FSPW"], status: "in-progress" },
      { code: "CMSC351", title: "Algorithms", credits: 3, tags: ["Major"], status: "in-progress" }
    ]
  },
  {
    term: "Fall 2027",
    credits: 15,
    status: "planned",
    courses: [
      { code: "CMSC420", title: "Data Structures", credits: 3, tags: ["Major"], status: "planned" },
      { code: "CMSC421", title: "Operating Systems", credits: 3, tags: ["Major"], status: "planned" },
      { code: "PHYS401", title: "Quantum Mechanics I", credits: 3, tags: ["Minor"], status: "planned" },
      { code: "HIST140", title: "History", credits: 3, tags: ["DSHS"], status: "planned" },
      { code: "PSYC100", title: "Intro to Psychology", credits: 3, tags: ["DSHS"], status: "planned" }
    ]
  },
  {
    term: "Spring 2028",
    credits: 14,
    status: "planned",
    courses: [
      { code: "CMSC424", title: "Database Design", credits: 3, tags: ["Major"], status: "planned" },
      { code: "CMSC433", title: "Software Engineering", credits: 3, tags: ["Major"], status: "planned" },
      { code: "PHYS402", title: "Quantum Mechanics II", credits: 3, tags: ["Minor"], status: "planned" },
      { code: "BIOL105", title: "Biology", credits: 3, tags: ["DSNL"], status: "planned" },
      { code: "HONR100", title: "Honors Seminar", credits: 2, tags: ["DVCC"], status: "planned" }
    ]
  },
  {
    term: "Fall 2028",
    credits: 12,
    status: "planned",
    courses: [
      { code: "CMSC434", title: "Human-Computer Interaction", credits: 3, tags: ["Major"], status: "planned" },
      { code: "CMSC436", title: "Mobile App Development", credits: 3, tags: ["Major"], status: "planned" },
      { code: "PHYS410", title: "Advanced Lab", credits: 3, tags: ["Minor"], status: "planned" },
      { code: "PHIL100", title: "Philosophy", credits: 3, tags: ["DSNS"], status: "planned" }
    ]
  },
  {
    term: "Spring 2029",
    credits: 13,
    status: "planned",
    courses: [
      { code: "CMSC498", title: "Capstone Project", credits: 3, tags: ["Major"], status: "planned" },
      { code: "CMSC475", title: "Combinatorics", credits: 3, tags: ["Major"], status: "planned" },
      { code: "PHYS499", title: "Physics Research", credits: 3, tags: ["Minor"], status: "planned" },
      { code: "ECON200", title: "Principles of Economics", credits: 4, tags: ["DSHS"], status: "planned" }
    ]
  }
];

export default function FourYearPlan() {
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<"current" | "ascending" | "descending">("current");
  const [collapsedSemesters, setCollapsedSemesters] = useState<Set<number>>(new Set());

  const toggleSemester = (index: number) => {
    const newCollapsed = new Set(collapsedSemesters);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedSemesters(newCollapsed);
  };

  const getSortedSemesters = () => {
    if (sortOrder === "current") {
      // Current semester on top, then chronological
      const currentIndex = semesters.findIndex(s => s.status === "current");
      if (currentIndex === -1) return semesters;
      
      return [
        semesters[currentIndex],
        ...semesters.slice(currentIndex + 1),
        ...semesters.slice(0, currentIndex)
      ];
    } else if (sortOrder === "ascending") {
      return [...semesters];
    } else {
      return [...semesters].reverse();
    }
  };

  const sortedSemesters = getSortedSemesters();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "border-green-600/50 bg-green-600/10";
      case "in-progress":
        return "border-blue-600/50 bg-blue-600/10";
      default:
        return "border-neutral-700 bg-neutral-800/30";
    }
  };

  const getSemesterHeaderColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-[#252525]";
      case "current":
        return "bg-gradient-to-r from-red-900/20 to-[#252525] border-red-600/50";
      default:
        return "bg-[#252525]";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
      case "in-progress":
        return <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">In Progress</Badge>;
      default:
        return <Badge variant="outline" className="border-neutral-700">Planned</Badge>;
    }
  };

  const getSemesterBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
      case "current":
        return <Badge className="bg-red-600/20 text-red-400 border border-red-600/30">Current Semester</Badge>;
      default:
        return null;
    }
  };

  const totalCredits = semesters.reduce((sum, sem) => sum + sem.credits, 0);
  const completedCredits = semesters
    .flatMap(s => s.courses)
    .filter(c => c.status === "completed")
    .reduce((sum, c) => sum + c.credits, 0);
  
  const inProgressCredits = semesters
    .flatMap(s => s.courses)
    .filter(c => c.status === "in-progress")
    .reduce((sum, c) => sum + c.credits, 0);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl text-white mb-2">Four-Year Plan</h1>
            <p className="text-neutral-400">Visualize your entire degree plan across all semesters</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="bg-red-600 hover:bg-red-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Term
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                <p>Add summer or winter term</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-5 h-5 text-red-400" />
              <h3 className="text-sm text-neutral-400">Total Credits</h3>
            </div>
            <p className="text-3xl text-white">{totalCredits}</p>
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-green-400" />
              <h3 className="text-sm text-neutral-400">Completed</h3>
            </div>
            <p className="text-3xl text-white">{completedCredits}</p>
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm text-neutral-400">In Progress</h3>
            </div>
            <p className="text-3xl text-white">{inProgressCredits}</p>
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-neutral-400" />
              <h3 className="text-sm text-neutral-400">Remaining</h3>
            </div>
            <p className="text-3xl text-white">{totalCredits - completedCredits - inProgressCredits}</p>
          </Card>
        </div>

        <Tabs defaultValue="semesters" className="space-y-6">
          <TabsList className="bg-[#252525] border border-neutral-800">
            <TabsTrigger value="semesters">Plan by Semester</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="geneds">Gen Eds</TabsTrigger>
            <TabsTrigger value="credits">Credits & Transfers</TabsTrigger>
          </TabsList>

          <TabsContent value="semesters" className="space-y-6">
            {/* Sort Controls */}
            <Card className="p-4 bg-[#252525] border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-neutral-400" />
                  <Label className="text-neutral-300">Sort Semesters</Label>
                </div>
                <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
                  <SelectTrigger className="w-48 bg-[#1a1a1a] border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current First (Default)</SelectItem>
                    <SelectItem value="ascending">Ascending (Oldest First)</SelectItem>
                    <SelectItem value="descending">Descending (Newest First)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <div className="space-y-6">
              {sortedSemesters.map((semester, semIndex) => {
                const originalIndex = semesters.indexOf(semester);
                const isCollapsed = collapsedSemesters.has(originalIndex);
                const isCurrent = semester.status === "current";
                
                return (
                  <Card 
                    key={originalIndex} 
                    className={`border-neutral-800 ${getSemesterHeaderColor(semester.status)} ${isCurrent ? 'shadow-lg shadow-red-600/10' : ''}`}
                  >
                    <div 
                      className="p-6 cursor-pointer hover:bg-[#2a2a2a] transition-colors"
                      onClick={() => toggleSemester(originalIndex)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className={`text-xl ${isCurrent ? 'text-red-400 font-semibold' : 'text-white'}`}>
                            {semester.term}
                          </h3>
                          <Badge variant="outline" className="border-neutral-700">
                            {semester.credits} credits
                          </Badge>
                          {getSemesterBadge(semester.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add Course
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                                <p>Add a course to this semester</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {isCollapsed ? (
                            <ChevronDown className="w-5 h-5 text-neutral-400" />
                          ) : (
                            <ChevronUp className="w-5 h-5 text-neutral-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="px-6 pb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {semester.courses.map((course, courseIndex) => (
                            <Card
                              key={courseIndex}
                              onClick={() => setSelectedCourse(course)}
                              className={`p-4 cursor-pointer transition-all hover:scale-[1.02] border ${getStatusColor(course.status)}`}
                            >
                              <div className="mb-2">
                                <div className="flex items-start justify-between mb-1">
                                  <h4 className="text-white">{course.code}</h4>
                                  <Badge variant="outline" className="border-neutral-700 text-xs">
                                    {course.credits}cr
                                  </Badge>
                                </div>
                                <p className="text-xs text-neutral-400 mb-2 line-clamp-2">{course.title}</p>
                              </div>
                              {course.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {course.tags.slice(0, 2).map((tag, i) => (
                                    <Badge key={i} className="bg-red-600/20 text-red-400 border border-red-600/30 text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {course.tags.length > 2 && (
                                    <Badge className="bg-neutral-700 text-neutral-300 text-xs">
                                      +{course.tags.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="requirements">
            <Card className="p-6 bg-[#252525] border-neutral-800 mb-6">
              <h3 className="text-xl text-white mb-4">Major & Minor Progress</h3>
              <div className="space-y-6">
                {/* Computer Science Major */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg text-white">Computer Science Major</h4>
                    <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                      70% Complete
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-neutral-300">Lower Level Core</span>
                        <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                          Complete
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          CMSC131
                        </Badge>
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          CMSC132
                        </Badge>
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          CMSC216
                        </Badge>
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          CMSC250
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-neutral-300">Upper Level Core</span>
                        <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                          2 / 5 Complete
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">
                          CMSC330 (Spring 2027)
                        </Badge>
                        <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">
                          CMSC351 (Spring 2027)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          CMSC420 (Fall 2027)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          CMSC421 (Fall 2027)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          CMSC424 (Spring 2028)
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-neutral-300">Upper Level Electives</span>
                        <Badge variant="outline" className="border-neutral-700">
                          0 / 4 Complete
                        </Badge>
                      </div>
                      <p className="text-sm text-neutral-400">Need to select 4 upper-level CMSC electives</p>
                    </div>
                  </div>
                </div>

                {/* Physics Minor */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg text-white">Physics Minor</h4>
                    <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                      67% Complete
                    </Badge>
                  </div>
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-300">Required Credits: 12 / 18</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          PHYS161 ✓
                        </Badge>
                        <Badge variant="outline" className="border-green-600/50 text-green-400 text-xs">
                          PHYS260 ✓
                        </Badge>
                        <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">
                          PHYS375 (In Progress)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          PHYS401 (Planned)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          PHYS402 (Planned)
                        </Badge>
                        <Badge variant="outline" className="border-neutral-700 text-xs">
                          PHYS410 (Planned)
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="geneds">
            <Card className="p-6 bg-[#252525] border-neutral-800">
              <h3 className="text-xl text-white mb-4">General Education Requirements</h3>
              
              <div className="space-y-4">
                {/* Fundamental Studies */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg text-white">Fundamental Studies</h4>
                    <Badge className="bg-amber-600/20 text-amber-400 border border-amber-600/30">
                      3 / 5 Complete
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm text-neutral-300">FSMA - Math</span>
                      </div>
                      <p className="text-xs text-neutral-400">MATH140 (Fall 2025)</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm text-neutral-300">FSOC - Oral Communication</span>
                      </div>
                      <p className="text-xs text-neutral-400">COMM107 (Fall 2025)</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-blue-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                        <span className="text-sm text-neutral-300">FSPW - Professional Writing</span>
                      </div>
                      <p className="text-xs text-neutral-400">ENGL393 (Spring 2027 - In Progress)</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-amber-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        <span className="text-sm text-neutral-300">FSAR - Analytic Reasoning</span>
                      </div>
                      <p className="text-xs text-neutral-400">Not yet fulfilled</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm text-neutral-300">FSAW - Academic Writing</span>
                      </div>
                      <p className="text-xs text-neutral-400">ENGL101 (Fall 2025)</p>
                    </div>
                  </div>
                </div>

                {/* Distributive Studies */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg text-white">Distributive Studies</h4>
                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                      6 / 8 Complete
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30 text-center">
                      <div className="w-3 h-3 rounded-full bg-green-400 mx-auto mb-1"></div>
                      <span className="text-xs text-neutral-300">DSHS</span>
                      <p className="text-xs text-neutral-400 mt-1">✓ 2 courses</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30 text-center">
                      <div className="w-3 h-3 rounded-full bg-green-400 mx-auto mb-1"></div>
                      <span className="text-xs text-neutral-300">DSHU</span>
                      <p className="text-xs text-neutral-400 mt-1">✓ 2 courses</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30 text-center">
                      <div className="w-3 h-3 rounded-full bg-green-400 mx-auto mb-1"></div>
                      <span className="text-xs text-neutral-300">DSSP</span>
                      <p className="text-xs text-neutral-400 mt-1">✓ 1 course</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30 text-center">
                      <div className="w-3 h-3 rounded-full bg-green-400 mx-auto mb-1"></div>
                      <span className="text-xs text-neutral-300">DSNL</span>
                      <p className="text-xs text-neutral-400 mt-1">✓ 1 course</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-amber-600/30 text-center">
                      <div className="w-3 h-3 rounded-full bg-amber-400 mx-auto mb-1"></div>
                      <span className="text-xs text-neutral-300">DSNS</span>
                      <p className="text-xs text-neutral-400 mt-1">Planned</p>
                    </div>
                  </div>
                </div>

                {/* Diversity */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg text-white">Diversity Requirements</h4>
                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                      Complete
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-green-600/30">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm text-neutral-300">DVUP - Understanding Plural Societies</span>
                      </div>
                      <p className="text-xs text-neutral-400">MUSC204, HISP200 (2 courses)</p>
                    </div>

                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-neutral-700">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-neutral-400"></div>
                        <span className="text-sm text-neutral-300">DVCC - Cultural Competence</span>
                      </div>
                      <p className="text-xs text-neutral-400">HONR100 (Planned Spring 2028)</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="credits">
            <div className="space-y-6">
              {/* Credit Summary */}
              <Card className="p-6 bg-[#252525] border-neutral-800">
                <h3 className="text-xl text-white mb-4">Credit Summary</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-5 h-5 text-green-400" />
                      <span className="text-sm text-neutral-400">UMD Credits</span>
                    </div>
                    <p className="text-3xl text-white">71</p>
                    <p className="text-xs text-neutral-400 mt-1">Earned at UMD</p>
                  </div>

                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-5 h-5 text-blue-400" />
                      <span className="text-sm text-neutral-400">Transfer Credits</span>
                    </div>
                    <p className="text-3xl text-white">12</p>
                    <p className="text-xs text-neutral-400 mt-1">AP & Transfer</p>
                  </div>

                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-5 h-5 text-purple-400" />
                      <span className="text-sm text-neutral-400">Total Credits</span>
                    </div>
                    <p className="text-3xl text-white">83</p>
                    <p className="text-xs text-neutral-400 mt-1">71 UMD + 12 Transfer</p>
                  </div>
                </div>
              </Card>

              {/* AP Credits */}
              <Card className="p-6 bg-[#252525] border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl text-white">AP & Transfer Credits</h3>
                  <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                    12 credits
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-white mb-1">AP Calculus BC</h4>
                        <p className="text-xs text-neutral-400">Score: 5</p>
                      </div>
                      <Badge variant="outline" className="border-green-600/50 text-green-400">
                        8 credits
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
                        MATH140 (4cr)
                      </Badge>
                      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
                        MATH141 (4cr)
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-white mb-1">AP English Language</h4>
                        <p className="text-xs text-neutral-400">Score: 4</p>
                      </div>
                      <Badge variant="outline" className="border-green-600/50 text-green-400">
                        3 credits
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
                        ENGL101 (3cr)
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-white mb-1">Transfer Credit - Community College</h4>
                        <p className="text-xs text-neutral-400">Montgomery College</p>
                      </div>
                      <Badge variant="outline" className="border-green-600/50 text-green-400">
                        1 credit
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
                        UNIV100 (1cr)
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
                  <p className="text-sm text-blue-400">
                    💡 <strong>Note:</strong> Transfer credits count toward your total credits but may not
                    fulfill all specific degree requirements. Check with your advisor.
                  </p>
                </div>
              </Card>

              {/* Credit Limits */}
              <Card className="p-6 bg-[#252525] border-neutral-800">
                <h3 className="text-xl text-white mb-4">Credit Policies & Limits</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <span className="text-neutral-300">Minimum Credits for Graduation</span>
                    <Badge variant="outline" className="border-neutral-700">120 credits</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <span className="text-neutral-300">Maximum Transfer Credits Allowed</span>
                    <Badge variant="outline" className="border-neutral-700">60 credits</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <span className="text-neutral-300">Your Current Transfer Credits</span>
                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                      12 / 60 credits
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <span className="text-neutral-300">Minimum UMD Credits Required</span>
                    <Badge variant="outline" className="border-neutral-700">60 credits</Badge>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCourse(null)}>
          <Card className="max-w-lg w-full p-6 bg-[#252525] border-neutral-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-2xl text-white mb-1">{selectedCourse.code}</h3>
              <p className="text-neutral-400 mb-3">{selectedCourse.title}</p>
              <div className="flex gap-2 mb-4">
                <Badge variant="outline" className="border-neutral-700">
                  {selectedCourse.credits} credits
                </Badge>
                {getStatusBadge(selectedCourse.status)}
              </div>
              {selectedCourse.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCourse.tags.map((tag: string, i: number) => (
                    <Badge key={i} className="bg-red-600/20 text-red-400 border border-red-600/30">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => setSelectedCourse(null)} variant="outline" className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800">
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}