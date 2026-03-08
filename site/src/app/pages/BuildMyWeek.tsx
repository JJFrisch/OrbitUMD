import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Search, Plus, Info, X } from "lucide-react";
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
import React from "react";

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
    genEds: ["DSNS"],
    description: "Fundamentals of quantum mechanics",
    sections: [
      { section: "0101", time: "MWF 1:00-1:50pm", instructor: "Dr. Williams", seats: "20/30" },
      { section: "0102", time: "TuTh 1:00-2:15pm", instructor: "Dr. Anderson", seats: "8/30" },
    ]
  },
  {
    code: "ENGL393",
    title: "Technical Writing",
    credits: 3,
    genEds: ["FSPW"],
    description: "Professional and technical writing skills",
    sections: [
      { section: "0101", time: "Tu 2:00-4:00pm", instructor: "Prof. Davis", seats: "15/25" },
      { section: "0102", time: "Th 3:00-5:00pm", instructor: "Prof. Wilson", seats: "0/25" },
    ]
  },
];

const timeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"
];

const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface ScheduledCourse {
  course: typeof sampleCourses[0];
  section: typeof sampleCourses[0]['sections'][0];
  color: string;
}

export default function BuildMyWeek() {
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduledCourses, setScheduledCourses] = useState<ScheduledCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<typeof sampleCourses[0] | null>(null);

  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500", "bg-pink-500"];

  const addCourseToSchedule = (course: typeof sampleCourses[0], section: typeof course.sections[0]) => {
    const color = colors[scheduledCourses.length % colors.length];
    setScheduledCourses([...scheduledCourses, { course, section, color }]);
    setSelectedCourse(null);
  };

  const removeCourseFromSchedule = (index: number) => {
    setScheduledCourses(scheduledCourses.filter((_, i) => i !== index));
  };

  const totalCredits = scheduledCourses.reduce((sum, sc) => sum + sc.course.credits, 0);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">Build My Week</h1>
          <p className="text-neutral-400">Search courses and build your ideal weekly schedule</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel */}
          <Card className="p-6 bg-[#252525] border-neutral-800 lg:col-span-1">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl text-white">Find Courses</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Search by course code, title, or Gen Ed</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <Input
                    placeholder="Search courses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-[#1a1a1a] border-neutral-700"
                  />
                </div>
              </div>

              <div>
                <Label>Semester</Label>
                <Select defaultValue="fall2027">
                  <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fall2027">Fall 2027</SelectItem>
                    <SelectItem value="spring2027">Spring 2027</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Gen Ed Filter</Label>
                <Select>
                  <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                    <SelectValue placeholder="All Gen Eds" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gen Eds</SelectItem>
                    <SelectItem value="fsma">FSMA - Math</SelectItem>
                    <SelectItem value="fspw">FSPW - Professional Writing</SelectItem>
                    <SelectItem value="dsns">DSNS - Natural Sciences</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-3">
                {sampleCourses
                  .filter((course) => 
                    searchQuery === "" ||
                    course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    course.title.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((course, index) => (
                    <Card
                      key={index}
                      className="p-4 bg-[#1a1a1a] border-neutral-800 hover:border-neutral-600 cursor-pointer transition-colors"
                      onClick={() => setSelectedCourse(course)}
                    >
                      <div className="mb-2">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-white">{course.code}</h3>
                          <Badge variant="outline" className="border-neutral-700 text-xs">
                            {course.credits} credits
                          </Badge>
                        </div>
                        <p className="text-sm text-neutral-400 mb-2">{course.title}</p>
                        {course.genEds[0] && (
                          <div className="flex gap-1">
                            {course.genEds.map((genEd, i) => (
                              <Badge key={i} className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs">
                                {genEd}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCourse(course);
                        }}
                      >
                        View Sections
                      </Button>
                    </Card>
                  ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Calendar View */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-[#252525] border-neutral-800">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl text-white">Weekly Calendar</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Total: {totalCredits} credits · {scheduledCourses.length} courses
                  </p>
                </div>
                <Button variant="outline" className="border-neutral-700 text-neutral-300 hover:bg-neutral-800">
                  Export Schedule
                </Button>
              </div>

              {/* Calendar Grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-6 gap-px bg-neutral-800 border border-neutral-800 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="bg-[#1a1a1a] p-3 text-neutral-500 text-sm">Time</div>
                    {daysOfWeek.map((day) => (
                      <div key={day} className="bg-[#1a1a1a] p-3 text-white text-sm text-center">
                        {day.substring(0, 3)}
                      </div>
                    ))}

                    {/* Time slots */}
                    {timeSlots.slice(0, 8).map((time) => (
                      <div key={time} className="contents">
                        <div className="bg-[#1a1a1a] p-3 text-neutral-500 text-xs">
                          {time}
                        </div>
                        {daysOfWeek.map((day) => (
                          <div key={`${day}-${time}`} className="bg-[#1a1a1a] p-2 min-h-[60px]" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scheduled Courses List */}
              {scheduledCourses.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg text-white mb-3">Scheduled Courses</h3>
                  <div className="space-y-2">
                    {scheduledCourses.map((sc, index) => (
                      <div
                        key={index}
                        className="p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${sc.color}`} />
                          <div>
                            <p className="text-white text-sm">
                              {sc.course.code} · Section {sc.section.section}
                            </p>
                            <p className="text-xs text-neutral-400">{sc.section.time}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCourseFromSchedule(index)}
                          className="hover:bg-red-600/20 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scheduledCourses.length === 0 && (
                <div className="mt-6 p-8 text-center border-2 border-dashed border-neutral-800 rounded-lg">
                  <Plus className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                  <p className="text-neutral-400">
                    Search for courses on the left and add them to your schedule
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Course Sections Modal */}
        {selectedCourse && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-2xl w-full p-6 bg-[#252525] border-neutral-800">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl text-white mb-1">{selectedCourse.code}</h3>
                  <p className="text-neutral-400 mb-2">{selectedCourse.title}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-neutral-700">
                      {selectedCourse.credits} credits
                    </Badge>
                    {selectedCourse.genEds[0] && selectedCourse.genEds.map((genEd, i) => (
                      <Badge key={i} className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                        {genEd}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedCourse(null)}
                  className="hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <p className="text-neutral-400 mb-6 text-sm">{selectedCourse.description}</p>

              <div>
                <h4 className="text-white mb-3">Available Sections</h4>
                <div className="space-y-2">
                  {selectedCourse.sections.map((section, index) => (
                    <div
                      key={index}
                      className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-white mb-1">Section {section.section}</p>
                        <p className="text-sm text-neutral-400 mb-1">{section.time}</p>
                        <p className="text-xs text-neutral-500">{section.instructor}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-neutral-500">Seats</p>
                          <p className="text-sm text-white">{section.seats}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => addCourseToSchedule(selectedCourse, section)}
                          className="bg-red-600 hover:bg-red-700"
                          disabled={section.seats.startsWith("0/")}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}