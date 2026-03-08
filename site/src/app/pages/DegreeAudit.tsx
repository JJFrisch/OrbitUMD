import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { CheckCircle2, Clock, AlertCircle, Info, FileText, Edit, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { Link } from "react-router";

export default function DegreeAudit() {
  const [genEdExpanded, setGenEdExpanded] = useState(true);
  const [majorExpanded, setMajorExpanded] = useState(true);
  const [minorExpanded, setMinorExpanded] = useState(true);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">Degree Audit</h1>
          <p className="text-neutral-400">Track your progress toward graduation</p>
        </div>

        {/* Summary Card */}
        <Card className="p-6 bg-[#252525] border-neutral-800 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm text-neutral-400">Total Credits</h3>
              </div>
              <p className="text-3xl text-white mb-1">71 / 120</p>
              <Progress value={59} className="h-2" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <h3 className="text-sm text-neutral-400">Completed</h3>
              </div>
              <p className="text-3xl text-white">55 cr</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm text-neutral-400">In Progress</h3>
              </div>
              <p className="text-3xl text-white">16 cr</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm text-neutral-400">Remaining</h3>
              </div>
              <p className="text-3xl text-white">49 cr</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-6 border-t border-neutral-800">
            <Link to="/four-year-plan" className="flex-1">
              <Button variant="outline" className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800">
                Open Four-Year Plan
              </Button>
            </Link>
            <Link to="/generate-schedule" className="flex-1">
              <Button className="w-full bg-red-600 hover:bg-red-700">
                Generate Next Schedule
              </Button>
            </Link>
          </div>
        </Card>

        {/* Requirements Sections */}
        <div className="space-y-6">
          {/* General Education */}
          <Card className="bg-[#252525] border-neutral-800">
            <div 
              className="p-6 cursor-pointer hover:bg-[#2a2a2a] transition-colors"
              onClick={() => setGenEdExpanded(!genEdExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl text-white">General Education</h2>
                  <Badge className="bg-amber-600/20 text-amber-400 border border-amber-600/30">
                    In Progress
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-5 h-5 text-neutral-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                        <p>UMD General Education requirements for all students</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {genEdExpanded ? (
                    <ChevronUp className="w-5 h-5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Progress value={90} className="flex-1 h-3" />
                <span className="text-white">38 / 42 credits</span>
              </div>
            </div>

            {genEdExpanded && (
              <div className="px-6 pb-6 space-y-4">
                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white">Fundamental Studies</h3>
                    <Badge className="bg-amber-600/20 text-amber-400 border border-amber-600/30">
                      4 / 5 complete
                    </Badge>
                  </div>
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-neutral-300">FSMA (Math) - MATH140 (Fall 2025)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-neutral-300">FSOC (Oral Comm) - COMM107 (Fall 2025)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-neutral-300">FSPW (Prof Writing) - ENGL393 (Spring 2027)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-neutral-300">FSAR (Analytic Reasoning) - Not fulfilled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-neutral-300">FSAW (Academic Writing) - Not fulfilled</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white">Distributive Studies</h3>
                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                      6 / 8 complete
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-400 mt-2">
                    View detailed breakdown in{" "}
                    <Link to="/gen-eds" className="text-red-400 hover:underline">
                      Gen Eds page
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Computer Science Major */}
          <Card className="bg-[#252525] border-neutral-800">
            <div 
              className="p-6 cursor-pointer hover:bg-[#2a2a2a] transition-colors"
              onClick={() => setMajorExpanded(!majorExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl text-white">Computer Science Major</h2>
                  <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                    In Progress
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/degree-requirements?program=major" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Requirements
                    </Button>
                  </Link>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-5 h-5 text-neutral-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                        <p>Computer Science B.S. major requirements</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {majorExpanded ? (
                    <ChevronUp className="w-5 h-5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Progress value={70} className="flex-1 h-3" />
                <span className="text-white">29 / 42 credits</span>
              </div>
            </div>

            {majorExpanded && (
              <div className="px-6 pb-6 space-y-4">
                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white">Lower Level Core Courses</h3>
                    <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                      Complete
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-green-600/50 text-green-400">
                      CMSC131 (Fall 2025)
                    </Badge>
                    <Badge variant="outline" className="border-green-600/50 text-green-400">
                      CMSC132 (Spring 2026)
                    </Badge>
                    <Badge variant="outline" className="border-green-600/50 text-green-400">
                      CMSC216 (Fall 2026)
                    </Badge>
                    <Badge variant="outline" className="border-green-600/50 text-green-400">
                      CMSC250 (Fall 2026)
                    </Badge>
                  </div>
                </div>

                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white">Upper Level Core Courses</h3>
                    <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                      2 / 5 complete
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-blue-600/50 text-blue-400">
                      CMSC330 (Spring 2027)
                    </Badge>
                    <Badge variant="outline" className="border-blue-600/50 text-blue-400">
                      CMSC351 (Spring 2027)
                    </Badge>
                    <Badge variant="outline" className="border-neutral-700">
                      CMSC420 (Planned Fall 2027)
                    </Badge>
                    <Badge variant="outline" className="border-neutral-700">
                      CMSC421 (Planned Fall 2027)
                    </Badge>
                    <Badge variant="outline" className="border-neutral-700">
                      CMSC424 (Planned Spring 2028)
                    </Badge>
                  </div>
                </div>

                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white">Upper Level Electives</h3>
                    <Badge variant="outline" className="border-neutral-700">
                      0 / 4 complete
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-400">Need to select 4 upper-level CMSC electives</p>
                </div>

                {/* Call to action to customize requirements */}
                <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Edit className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-blue-400 mb-2">
                        <strong>Customize Your Requirements</strong>
                      </p>
                      <p className="text-xs text-blue-400/80 mb-3">
                        Build your own degree structure with AND/OR course groupings. Perfect for creating
                        custom majors, special programs, or tracking alternative requirements.
                      </p>
                      <Link to="/degree-requirements?program=major">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-600 text-blue-400 hover:bg-blue-600/20"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Go to Degree Requirements Builder
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Physics Minor */}
          <Card className="bg-[#252525] border-neutral-800">
            <div 
              className="p-6 cursor-pointer hover:bg-[#2a2a2a] transition-colors"
              onClick={() => setMinorExpanded(!minorExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl text-white">Physics Minor</h2>
                  <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                    In Progress
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/degree-requirements?program=minor" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Requirements
                    </Button>
                  </Link>
                  {minorExpanded ? (
                    <ChevronUp className="w-5 h-5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Progress value={67} className="flex-1 h-3" />
                <span className="text-white">12 / 18 credits</span>
              </div>
            </div>

            {minorExpanded && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                  <p className="text-neutral-400 mb-3">Completed: PHYS161, PHYS260, PHYS375 (in progress)</p>
                  <p className="text-neutral-400">Remaining: 3 upper-level physics courses</p>
                </div>
                
                {/* Call to action for minor */}
                <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Edit className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-blue-400 mb-2">
                        <strong>Customize Minor Requirements</strong>
                      </p>
                      <p className="text-xs text-blue-400/80 mb-3">
                        Define your Physics minor requirements with custom sections and course groupings.
                      </p>
                      <Link to="/degree-requirements?program=minor">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-600 text-blue-400 hover:bg-blue-600/20"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Go to Degree Requirements Builder
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
