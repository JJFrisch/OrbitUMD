import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { Info, X, Plus, Calendar as CalendarIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

const sampleSchedules = [
  {
    id: "A",
    credits: 16,
    daysOnCampus: 4,
    earliestClass: "9:00 AM",
    latestClass: "4:00 PM",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", section: "0101", time: "MWF 9:00-9:50am", instructor: "Dr. Smith", color: "bg-blue-500" },
      { code: "MATH340", title: "Multivariable Calculus", section: "0201", time: "TuTh 11:00-12:15pm", instructor: "Dr. Johnson", color: "bg-green-500" },
      { code: "PHYS375", title: "Intro to Quantum Physics", section: "0101", time: "MWF 1:00-1:50pm", instructor: "Dr. Williams", color: "bg-purple-500" },
      { code: "ENGL393", title: "Technical Writing", section: "0102", time: "Tu 2:00-4:00pm", instructor: "Prof. Davis", color: "bg-amber-500" },
    ]
  },
  {
    id: "B",
    credits: 15,
    daysOnCampus: 3,
    earliestClass: "10:00 AM",
    latestClass: "3:00 PM",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", section: "0102", time: "TuTh 10:00-11:15am", instructor: "Dr. Brown", color: "bg-blue-500" },
      { code: "MATH340", title: "Multivariable Calculus", section: "0101", time: "MWF 11:00-11:50am", instructor: "Dr. Taylor", color: "bg-green-500" },
      { code: "PHYS375", title: "Intro to Quantum Physics", section: "0102", time: "TuTh 1:00-2:15pm", instructor: "Dr. Anderson", color: "bg-purple-500" },
    ]
  },
  {
    id: "C",
    credits: 17,
    daysOnCampus: 5,
    earliestClass: "8:00 AM",
    latestClass: "5:00 PM",
    courses: [
      { code: "CMSC330", title: "Org. of Programming Languages", section: "0103", time: "MWF 8:00-8:50am", instructor: "Dr. Lee", color: "bg-blue-500" },
      { code: "MATH340", title: "Multivariable Calculus", section: "0203", time: "TuTh 2:00-3:15pm", instructor: "Dr. Martinez", color: "bg-green-500" },
      { code: "PHYS375", title: "Intro to Quantum Physics", section: "0103", time: "MWF 3:00-3:50pm", instructor: "Dr. Garcia", color: "bg-purple-500" },
      { code: "ENGL393", title: "Technical Writing", section: "0101", time: "Th 4:00-5:00pm", instructor: "Prof. Wilson", color: "bg-amber-500" },
    ]
  }
];

export default function GenerateSchedule() {
  const [requiredCourses, setRequiredCourses] = useState<string[]>(["CMSC330", "MATH340"]);
  const [optionalCourses, setOptionalCourses] = useState<string[]>(["PHYS375"]);
  const [newRequired, setNewRequired] = useState("");
  const [newOptional, setNewOptional] = useState("");
  const [showSchedules, setShowSchedules] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);

  const addRequiredCourse = () => {
    if (newRequired.trim()) {
      setRequiredCourses([...requiredCourses, newRequired.trim()]);
      setNewRequired("");
    }
  };

  const addOptionalCourse = () => {
    if (newOptional.trim()) {
      setOptionalCourses([...optionalCourses, newOptional.trim()]);
      setNewOptional("");
    }
  };

  const removeRequiredCourse = (index: number) => {
    setRequiredCourses(requiredCourses.filter((_, i) => i !== index));
  };

  const removeOptionalCourse = (index: number) => {
    setOptionalCourses(optionalCourses.filter((_, i) => i !== index));
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">Generate Schedule</h1>
          <p className="text-neutral-400">Create possible schedules based on your course selections and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Criteria Panel */}
          <Card className="p-6 bg-[#252525] border-neutral-800 lg:col-span-1">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl text-white">Schedule Criteria</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Set your preferences and constraints for schedule generation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-6">
              {/* Term Selector */}
              <div>
                <Label>Term</Label>
                <Select defaultValue="fall2027">
                  <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fall2027">Fall 2027</SelectItem>
                    <SelectItem value="spring2027">Spring 2027</SelectItem>
                    <SelectItem value="fall2026">Fall 2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Required Courses */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Required Courses</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-neutral-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                        <p>Courses that must be in your schedule</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="e.g., CMSC330"
                    value={newRequired}
                    onChange={(e) => setNewRequired(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addRequiredCourse()}
                    className="bg-[#1a1a1a] border-neutral-700"
                  />
                  <Button onClick={addRequiredCourse} size="icon" className="bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredCourses.map((course, index) => (
                    <Badge key={index} className="bg-green-600/20 text-green-400 border border-green-600/30">
                      {course}
                      <X
                        className="w-3 h-3 ml-2 cursor-pointer hover:text-white"
                        onClick={() => removeRequiredCourse(index)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Optional Courses */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Optional Courses</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-neutral-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                        <p>Courses that may be included if they fit</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="e.g., ENGL393"
                    value={newOptional}
                    onChange={(e) => setNewOptional(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addOptionalCourse()}
                    className="bg-[#1a1a1a] border-neutral-700"
                  />
                  <Button onClick={addOptionalCourse} size="icon" className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {optionalCourses.map((course, index) => (
                    <Badge key={index} className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                      {course}
                      <X
                        className="w-3 h-3 ml-2 cursor-pointer hover:text-white"
                        onClick={() => removeOptionalCourse(index)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Credits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Credits</Label>
                  <Select defaultValue="12">
                    <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 13, 14, 15, 16, 17, 18].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Credits</Label>
                  <Select defaultValue="18">
                    <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 16, 17, 18, 19, 20, 21].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Delivery Method */}
              <div>
                <Label className="mb-3 block">Delivery Method</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="face-to-face" defaultChecked />
                    <label htmlFor="face-to-face" className="text-sm text-neutral-300">
                      Face-to-Face
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="blended" />
                    <label htmlFor="blended" className="text-sm text-neutral-300">
                      Blended
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="online" />
                    <label htmlFor="online" className="text-sm text-neutral-300">
                      Online
                    </label>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <Label>Location/Program</Label>
                <Select defaultValue="cp">
                  <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cp">College Park</SelectItem>
                    <SelectItem value="sg">Shady Grove</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filters */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="open-sections" defaultChecked />
                  <label htmlFor="open-sections" className="text-sm text-neutral-300">
                    Only show open sections
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-neutral-800">
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={() => setShowSchedules(true)}
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Generate Schedules
                </Button>
                <Button variant="outline" className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800">
                  Reset Criteria
                </Button>
              </div>
            </div>
          </Card>

          {/* Generated Schedules */}
          <div className="lg:col-span-2">
            {!showSchedules ? (
              <Card className="p-12 bg-[#252525] border-neutral-800 text-center">
                <CalendarIcon className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">Ready to generate schedules</h3>
                <p className="text-neutral-400">
                  Set your criteria on the left and click "Generate Schedules" to see possible options.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl text-white mb-2">Generated Schedules</h2>
                  <p className="text-neutral-400">Found 3 possible schedules. Click one to see details.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {sampleSchedules.map((schedule) => (
                    <Card
                      key={schedule.id}
                      onClick={() => setSelectedSchedule(schedule.id)}
                      className={`p-4 cursor-pointer transition-all ${
                        selectedSchedule === schedule.id
                          ? "bg-red-600/20 border-red-600"
                          : "bg-[#252525] border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      <div className="text-center mb-4">
                        <h3 className="text-2xl text-white mb-1">Schedule {schedule.id}</h3>
                        <Badge variant="outline" className="border-neutral-700">
                          {schedule.credits} credits
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Days on campus:</span>
                          <span className="text-white">{schedule.daysOnCampus}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Earliest class:</span>
                          <span className="text-white">{schedule.earliestClass}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Latest class:</span>
                          <span className="text-white">{schedule.latestClass}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {selectedSchedule && (
                  <Card className="p-6 bg-[#252525] border-neutral-800">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl text-white">
                        Schedule {selectedSchedule} Details
                      </h3>
                      <div className="flex gap-2">
                        <Button variant="outline" className="border-neutral-700 text-neutral-300 hover:bg-neutral-800">
                          Export to Calendar
                        </Button>
                        <Button className="bg-red-600 hover:bg-red-700">
                          Save Schedule
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {sampleSchedules
                        .find((s) => s.id === selectedSchedule)
                        ?.courses.map((course, index) => (
                          <div
                            key={index}
                            className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800 flex items-start gap-4"
                          >
                            <div className={`w-1 h-full ${course.color} rounded-full`} />
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="text-white mb-1">
                                    {course.code} · {course.title}
                                  </h4>
                                  <p className="text-sm text-neutral-400">
                                    Section {course.section} · {course.instructor}
                                  </p>
                                </div>
                                <Badge variant="outline" className="border-neutral-700">
                                  {course.time.split(" ")[0]}
                                </Badge>
                              </div>
                              <p className="text-sm text-neutral-400">{course.time}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
