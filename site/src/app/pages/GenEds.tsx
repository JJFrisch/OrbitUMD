import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Info, CheckCircle2, Clock, XCircle, Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

const genEdData = [
  {
    code: "FSAR",
    name: "Analytic Reasoning",
    category: "Fundamental Studies",
    status: "Not started",
    required: 1,
    completed: 0,
    remaining: 1,
    fulfilledBy: [],
    description: "Courses that develop skills in quantitative and analytical reasoning."
  },
  {
    code: "FSAW",
    name: "Academic Writing",
    category: "Fundamental Studies",
    status: "Not started",
    required: 1,
    completed: 0,
    remaining: 1,
    fulfilledBy: [],
    description: "Courses focused on academic writing and communication skills."
  },
  {
    code: "FSMA",
    name: "Math",
    category: "Fundamental Studies",
    status: "Completed",
    required: 1,
    completed: 1,
    remaining: 0,
    fulfilledBy: [{ code: "MATH140", term: "Fall 2025" }],
    description: "Mathematical foundations and problem-solving."
  },
  {
    code: "FSOC",
    name: "Oral Communication",
    category: "Fundamental Studies",
    status: "Completed",
    required: 1,
    completed: 1,
    remaining: 0,
    fulfilledBy: [{ code: "COMM107", term: "Fall 2025" }],
    description: "Development of oral presentation and communication skills."
  },
  {
    code: "FSPW",
    name: "Professional Writing",
    category: "Fundamental Studies",
    status: "In progress",
    required: 1,
    completed: 0,
    remaining: 0,
    fulfilledBy: [{ code: "ENGL393", term: "Spring 2026" }],
    description: "Professional and technical writing in various contexts."
  },
  {
    code: "DSHS",
    name: "History and Social Sciences",
    category: "Distributive Studies",
    status: "Not started",
    required: 2,
    completed: 0,
    remaining: 2,
    fulfilledBy: [],
    description: "Historical and social science perspectives."
  },
  {
    code: "DSHU",
    name: "Humanities",
    category: "Distributive Studies",
    status: "Completed",
    required: 2,
    completed: 2,
    remaining: 0,
    fulfilledBy: [
      { code: "MUSC204", term: "Spring 2026" },
      { code: "HISP200", term: "Spring 2026" }
    ],
    description: "Humanities courses exploring culture, arts, and human experience."
  },
  {
    code: "DSNL",
    name: "Natural Sciences with Lab",
    category: "Distributive Studies",
    status: "Not started",
    required: 1,
    completed: 0,
    remaining: 1,
    fulfilledBy: [],
    description: "Laboratory-based natural science courses."
  },
  {
    code: "DSNS",
    name: "Natural Sciences",
    category: "Distributive Studies",
    status: "Not started",
    required: 1,
    completed: 0,
    remaining: 1,
    fulfilledBy: [],
    description: "Natural science courses without lab component."
  },
  {
    code: "DSSP",
    name: "Scholarship in Practice",
    category: "Distributive Studies",
    status: "In progress",
    required: 2,
    completed: 0,
    remaining: 1,
    fulfilledBy: [{ code: "PHYS375", term: "Spring 2027" }],
    description: "Experiential learning and research opportunities."
  },
  {
    code: "SCIS",
    name: "Understanding Plural Societies (I-Series)",
    category: "I-Series / Big Question",
    status: "Completed",
    required: 1,
    completed: 1,
    remaining: 0,
    fulfilledBy: [{ code: "CMSC204", term: "Fall 2026" }],
    description: "Interdisciplinary courses examining plural societies."
  },
  {
    code: "I-SERIES",
    name: "I-Series / Big Question",
    category: "I-Series / Big Question",
    status: "Completed",
    required: 2,
    completed: 2,
    remaining: 0,
    fulfilledBy: [
      { code: "CMSC204", term: "Fall 2026" },
      { code: "HISP200", term: "Spring 2026" }
    ],
    description: "Interdisciplinary inquiry courses."
  },
  {
    code: "DVUP",
    name: "Understanding Plural Societies",
    category: "Diversity",
    status: "Completed",
    required: 2,
    completed: 2,
    remaining: 0,
    fulfilledBy: [
      { code: "MUSC204", term: "Spring 2026" },
      { code: "HISP200", term: "Spring 2026" }
    ],
    description: "Courses examining diversity in plural societies."
  },
  {
    code: "DVCC",
    name: "Cultural Competence",
    category: "Diversity",
    status: "Not started",
    required: 1,
    completed: 0,
    remaining: 1,
    fulfilledBy: [],
    description: "Development of cultural competence and awareness."
  }
];

const categories = ["All", "Fundamental Studies", "Distributive Studies", "I-Series / Big Question", "Diversity"];
const statuses = ["All", "Completed", "In progress", "Not started"];

export default function GenEds() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedGenEd, setSelectedGenEd] = useState<typeof genEdData[0] | null>(null);

  const filteredData = genEdData.filter((item) => {
    if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
    if (statusFilter !== "All" && item.status !== statusFilter) return false;
    return true;
  });

  // Calculate summary stats
  const fundamentalTotal = genEdData.filter((g) => g.category === "Fundamental Studies").reduce((sum, g) => sum + g.required, 0);
  const fundamentalCompleted = genEdData.filter((g) => g.category === "Fundamental Studies").reduce((sum, g) => sum + g.completed, 0);
  
  const distributiveTotal = genEdData.filter((g) => g.category === "Distributive Studies").reduce((sum, g) => sum + g.required, 0);
  const distributiveCompleted = genEdData.filter((g) => g.category === "Distributive Studies").reduce((sum, g) => sum + g.completed, 0);
  
  const iSeriesTotal = 2;
  const iSeriesCompleted = 2;
  
  const diversityTotal = 3;
  const diversityCompleted = 2;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Completed":
        return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
      case "In progress":
        return <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">In Progress</Badge>;
      default:
        return <Badge variant="outline" className="border-neutral-700">Not Started</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Completed":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case "In progress":
        return <Clock className="w-5 h-5 text-blue-400" />;
      default:
        return <XCircle className="w-5 h-5 text-neutral-600" />;
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">General Education Progress</h1>
          <p className="text-neutral-400">Track your progress through UMD's Gen Ed requirements</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Fundamental Studies</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Core academic skills including writing, math, and reasoning</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl text-white mb-2">{fundamentalCompleted} / {fundamentalTotal}</p>
            <Progress 
              value={(fundamentalCompleted / fundamentalTotal) * 100} 
              className="h-2" 
            />
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Distributive Studies</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Breadth across humanities, sciences, and social sciences</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl text-white mb-2">{distributiveCompleted} / {distributiveTotal}</p>
            <Progress 
              value={(distributiveCompleted / distributiveTotal) * 100} 
              className="h-2" 
            />
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">I-Series</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Interdisciplinary inquiry and research courses</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl text-white mb-2">{iSeriesCompleted} / {iSeriesTotal}</p>
            <Progress 
              value={(iSeriesCompleted / iSeriesTotal) * 100} 
              className="h-2 bg-neutral-800 [&>div]:bg-green-500" 
            />
          </Card>

          <Card className="p-4 bg-[#252525] border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Diversity</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                    <p>Cultural competence and understanding plural societies</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl text-white mb-2">{diversityCompleted} / {diversityTotal}</p>
            <Progress 
              value={(diversityCompleted / diversityTotal) * 100} 
              className="h-2" 
            />
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 bg-[#252525] border-neutral-800 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Category:</span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48 bg-[#1a1a1a] border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 bg-[#1a1a1a] border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Gen Eds Table */}
        <Card className="bg-[#252525] border-neutral-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-transparent">
                <TableHead className="text-neutral-400">Gen Ed</TableHead>
                <TableHead className="text-neutral-400">Category</TableHead>
                <TableHead className="text-neutral-400">Status</TableHead>
                <TableHead className="text-neutral-400 text-center">Required</TableHead>
                <TableHead className="text-neutral-400 text-center">Completed</TableHead>
                <TableHead className="text-neutral-400 text-center">Remaining</TableHead>
                <TableHead className="text-neutral-400">Fulfilled By</TableHead>
                <TableHead className="text-neutral-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item, index) => (
                <TableRow 
                  key={index} 
                  className={`border-neutral-800 ${
                    item.status === "Completed" ? "bg-green-600/5" : 
                    item.status === "In progress" ? "bg-blue-600/5" : ""
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <div>
                        <p className="text-white">{item.code}</p>
                        <p className="text-xs text-neutral-400">{item.name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-neutral-300">{item.category}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell className="text-center text-white">{item.required}</TableCell>
                  <TableCell className="text-center text-white">{item.completed}</TableCell>
                  <TableCell className="text-center text-white">{item.remaining}</TableCell>
                  <TableCell>
                    {item.fulfilledBy.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.fulfilledBy.map((course, i) => (
                          <Badge key={i} variant="outline" className="border-neutral-700 text-xs">
                            {course.code} ({course.term})
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-neutral-500 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedGenEd(item)}
                      className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Options
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Gen Ed Details Modal */}
        {selectedGenEd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-3xl w-full p-6 bg-[#252525] border-neutral-800 max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl text-white mb-1">{selectedGenEd.code} · {selectedGenEd.name}</h3>
                  <p className="text-neutral-400 mb-3">{selectedGenEd.description}</p>
                  <div className="flex gap-2">
                    {getStatusBadge(selectedGenEd.status)}
                    <Badge variant="outline" className="border-neutral-700">
                      {selectedGenEd.category}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedGenEd(null)}
                  className="hover:bg-neutral-800"
                >
                  <XCircle className="w-5 h-5" />
                </Button>
              </div>

              <div className="mb-6">
                <h4 className="text-white mb-2">Progress</h4>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-neutral-400">Required: {selectedGenEd.required}</span>
                  <span className="text-neutral-400">Completed: {selectedGenEd.completed}</span>
                  <span className="text-neutral-400">Remaining: {selectedGenEd.remaining}</span>
                </div>
              </div>

              {selectedGenEd.fulfilledBy.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-white mb-3">Fulfilled By</h4>
                  <div className="space-y-2">
                    {selectedGenEd.fulfilledBy.map((course, i) => (
                      <div key={i} className="p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                        <p className="text-white">{course.code}</p>
                        <p className="text-sm text-neutral-400">{course.term}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-white mb-3">Sample Courses That Satisfy This Requirement</h4>
                <p className="text-sm text-neutral-400 mb-3">
                  These are just examples. Visit the UMD catalog for a complete list.
                </p>
                <div className="space-y-2">
                  {["Course Example 1", "Course Example 2", "Course Example 3"].map((course, i) => (
                    <div key={i} className="p-3 bg-[#1a1a1a] rounded-lg border border-neutral-800 flex items-center justify-between">
                      <p className="text-white">{course}</p>
                      <Button size="sm" variant="outline" className="border-neutral-700">
                        Add to Plan
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-800">
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={() => window.open("https://app.testudo.umd.edu", "_blank")}
                >
                  Search All Courses in Testudo
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
