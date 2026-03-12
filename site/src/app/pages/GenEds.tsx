import { useEffect, useMemo, useState } from "react";
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
import { plannerApi } from "@/lib/api/planner";
import { getAcademicProgressStatus, getCurrentAcademicTerm } from "@/lib/scheduling/termProgress";
import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";

interface TaggedCourse {
  code: string;
  title: string;
  termLabel: string;
  status: "completed" | "in_progress" | "planned";
  genEds: string[];
}

interface GenEdMeta {
  code: string;
  name: string;
  category: string;
  required: number;
  description: string;
}

interface GenEdRow extends GenEdMeta {
  status: "Completed" | "In progress" | "Not started";
  completed: number;
  remaining: number;
  fulfilledBy: TaggedCourse[];
}

type GenEdFulfillmentConfig = GenEdMeta & {
  sourceCodes: string[];
  statusCodes?: string[];
};

const TERM_NAME: Record<string, string> = {
  "01": "Spring",
  "05": "Summer",
  "08": "Fall",
  "12": "Winter",
};

const GEN_ED_REQUIREMENTS: GenEdMeta[] = [
  { code: "FSAR", name: "Analytic Reasoning", category: "Fundamental Studies", required: 1, description: "Quantitative and analytical reasoning." },
  { code: "FSAW", name: "Academic Writing", category: "Fundamental Studies", required: 1, description: "Academic writing and communication." },
  { code: "FSMA", name: "Math", category: "Fundamental Studies", required: 1, description: "Mathematical foundations and problem-solving." },
  { code: "FSOC", name: "Oral Communication", category: "Fundamental Studies", required: 1, description: "Oral presentation and communication skills." },
  { code: "FSPW", name: "Professional Writing", category: "Fundamental Studies", required: 1, description: "Professional and technical writing." },
  { code: "DSHS", name: "History and Social Sciences", category: "Distributive Studies", required: 2, description: "Historical and social science perspectives." },
  { code: "DSHU", name: "Humanities", category: "Distributive Studies", required: 2, description: "Humanities courses across culture and arts." },
  { code: "DSNL", name: "Natural Sciences with Lab", category: "Distributive Studies", required: 1, description: "Laboratory-based natural science coursework." },
  { code: "DSNS", name: "Natural Sciences", category: "Distributive Studies", required: 1, description: "Natural science coursework." },
  { code: "DSSP", name: "Scholarship in Practice", category: "Distributive Studies", required: 2, description: "Practice-based and experiential learning." },
  { code: "I-SERIES", name: "I-Series / Big Question", category: "I-Series / Big Question", required: 2, description: "Interdisciplinary inquiry courses." },
  { code: "DVUP", name: "Understanding Plural Societies", category: "Diversity", required: 2, description: "Diversity and plural societies coursework." },
  { code: "DVCC", name: "Cultural Competence", category: "Diversity", required: 1, description: "Cultural competence and global perspective." },
];

const GEN_ED_FULFILLMENT_CONFIG: GenEdFulfillmentConfig[] = [
  { code: "FSAR", name: "Analytic Reasoning", category: "Fundamental Studies", required: 1, description: "Quantitative and analytical reasoning.", sourceCodes: ["FSAR"] },
  { code: "FSAW", name: "Academic Writing", category: "Fundamental Studies", required: 1, description: "Academic writing and communication.", sourceCodes: ["FSAW"] },
  { code: "FSMA", name: "Math", category: "Fundamental Studies", required: 1, description: "Mathematical foundations and problem-solving.", sourceCodes: ["FSMA"] },
  { code: "FSOC", name: "Oral Communication", category: "Fundamental Studies", required: 1, description: "Oral presentation and communication skills.", sourceCodes: ["FSOC"] },
  { code: "FSPW", name: "Professional Writing", category: "Fundamental Studies", required: 1, description: "Professional and technical writing.", sourceCodes: ["FSPW"] },
  { code: "DSHS", name: "History and Social Sciences", category: "Distributive Studies", required: 2, description: "Historical and social science perspectives.", sourceCodes: ["DSHS"] },
  { code: "DSHU", name: "Humanities", category: "Distributive Studies", required: 2, description: "Humanities courses across culture and arts.", sourceCodes: ["DSHU"] },
  { code: "DSNL", name: "Natural Sciences with Lab", category: "Distributive Studies", required: 1, description: "Laboratory-based natural science coursework.", sourceCodes: ["DSNL"] },
  { code: "DSNS", name: "Natural Sciences", category: "Distributive Studies", required: 1, description: "Natural science coursework.", sourceCodes: ["DSNS"] },
  { code: "DSSP", name: "Scholarship in Practice", category: "Distributive Studies", required: 2, description: "Practice-based and experiential learning.", sourceCodes: ["DSSP"] },
  { code: "I-SERIES", name: "I-Series / Big Question", category: "I-Series / Big Question", required: 2, description: "Interdisciplinary inquiry courses.", sourceCodes: ["I-SERIES", "SCIS"] },
  { code: "DVUP", name: "Understanding Plural Societies", category: "Diversity", required: 2, description: "Diversity and plural societies coursework.", sourceCodes: ["DVUP"] },
  { code: "DVCC", name: "Cultural Competence", category: "Diversity", required: 1, description: "Cultural competence and global perspective.", sourceCodes: ["DVCC"] },
];

const GEN_ED_SEARCH_TAGS: Record<string, string[]> = {
  "I-SERIES": ["I-SERIES", "SCIS"],
  DVCC: ["DVCC", "DVUP"],
};

function dedupeTaggedCourses(courses: TaggedCourse[]): TaggedCourse[] {
  const byCode = new Map<string, TaggedCourse>();
  for (const course of courses) {
    const existing = byCode.get(course.code);
    if (!existing || statusRank(course.status) > statusRank(existing.status)) {
      byCode.set(course.code, course);
    }
  }
  return Array.from(byCode.values()).sort((a, b) => statusRank(b.status) - statusRank(a.status));
}

function buildGenEdRows(coursesByTag: Map<string, TaggedCourse[]>): GenEdRow[] {
  const baseRows = GEN_ED_FULFILLMENT_CONFIG.map((meta) => {
    const fulfilled = dedupeTaggedCourses(meta.sourceCodes.flatMap((code) => coursesByTag.get(code) ?? []));
    const completedCount = fulfilled.filter((f) => f.status === "completed").length;
    const inProgressCount = fulfilled.filter((f) => f.status === "in_progress").length;
    const plannedCount = fulfilled.filter((f) => f.status === "planned").length;

    const completedSlots = Math.min(meta.required, completedCount);
    const inProgressSlots = Math.min(Math.max(0, meta.required - completedSlots), inProgressCount);
    const plannedSlots = Math.min(Math.max(0, meta.required - completedSlots - inProgressSlots), plannedCount);

    let status: GenEdRow["status"] = "Not started";
    if (completedSlots >= meta.required) {
      status = "Completed";
    } else if (inProgressSlots + plannedSlots > 0) {
      status = "In progress";
    }

    return {
      code: meta.code,
      name: meta.name,
      category: meta.category,
      required: meta.required,
      description: meta.description,
      status,
      completed: completedSlots,
      remaining: Math.max(0, meta.required - completedSlots),
      fulfilledBy: fulfilled,
    } satisfies GenEdRow;
  });

  const dvupRow = baseRows.find((row) => row.code === "DVUP");
  const dvccRow = baseRows.find((row) => row.code === "DVCC");
  if (dvupRow && dvccRow) {
    const explicitDvcc = dedupeTaggedCourses(coursesByTag.get("DVCC") ?? []);
    const surplusDvup = dedupeTaggedCourses(coursesByTag.get("DVUP") ?? []).slice(dvupRow.required);
    const dvccFulfilled = dedupeTaggedCourses([...explicitDvcc, ...surplusDvup]);
    const completedCount = dvccFulfilled.filter((f) => f.status === "completed").length;
    const inProgressCount = dvccFulfilled.filter((f) => f.status === "in_progress").length;
    const plannedCount = dvccFulfilled.filter((f) => f.status === "planned").length;
    const completedSlots = Math.min(dvccRow.required, completedCount);
    const inProgressSlots = Math.min(Math.max(0, dvccRow.required - completedSlots), inProgressCount);
    const plannedSlots = Math.min(Math.max(0, dvccRow.required - completedSlots - inProgressSlots), plannedCount);

    dvccRow.fulfilledBy = dvccFulfilled;
    dvccRow.completed = completedSlots;
    dvccRow.remaining = Math.max(0, dvccRow.required - completedSlots);
    dvccRow.status = completedSlots >= dvccRow.required ? "Completed" : (inProgressSlots + plannedSlots > 0 ? "In progress" : "Not started");
  }

  return baseRows;
}

function parseSelections(stored: unknown): Array<any> {
  const payload = (stored ?? []) as { selections?: any[] } | any[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function statusRank(status: TaggedCourse["status"]): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  return 1;
}

function getStatusBadge(status: GenEdRow["status"]) {
  if (status === "Completed") {
    return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
  }
  if (status === "In progress") {
    return <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">In Progress</Badge>;
  }
  return <Badge variant="outline" className="border-border">Not Started</Badge>;
}

function getStatusIcon(status: GenEdRow["status"]) {
  if (status === "Completed") return <CheckCircle2 className="w-5 h-5 text-green-400" />;
  if (status === "In progress") return <Clock className="w-5 h-5 text-blue-400" />;
  return <XCircle className="w-5 h-5 text-neutral-600" />;
}

function formatTermLabel(termCode: string, termYear: number): string {
  return `${TERM_NAME[termCode] ?? "Term"} ${termYear}`;
}

export default function GenEds() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenEd, setSelectedGenEd] = useState<GenEdRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coursesByTag, setCoursesByTag] = useState<Map<string, TaggedCourse[]>>(new Map());
  const [sampleCourses, setSampleCourses] = useState<Array<{ code: string; title: string; credits: number; genEds: string[] }>>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const [schedules, userId] = await Promise.all([
          plannerApi.listAllSchedulesWithSelections(),
          getAuthenticatedUserId(),
        ]);
        const supabase = getSupabaseClient();

        const { data: priorCredits, error: priorError } = await supabase
          .from("user_prior_credits")
          .select("umd_course_code, original_name, gen_ed_codes, term_awarded")
          .eq("user_id", userId);

        if (priorError) throw priorError;
        if (!active) return;

        const byCourseCode = new Map<string, TaggedCourse>();
        const mainSchedules = schedules.filter((s) => s.is_primary && s.term_code && s.term_year);

        for (const schedule of mainSchedules) {
          const courseStatus = getAcademicProgressStatus({
            termCode: schedule.term_code!,
            termYear: schedule.term_year!,
          });
          const termLabel = formatTermLabel(schedule.term_code!, schedule.term_year!);

          for (const selection of parseSelections(schedule.selections_json)) {
            const code = String(selection?.course?.courseCode ?? "").toUpperCase();
            if (!code) continue;

            const existing = byCourseCode.get(code);
            const candidate: TaggedCourse = {
              code,
              title: String(selection?.course?.name ?? "Untitled Course"),
              termLabel,
              status: courseStatus,
              genEds: Array.isArray(selection?.course?.genEds) ? selection.course.genEds.map(String) : [],
            };

            if (!existing || statusRank(candidate.status) > statusRank(existing.status)) {
              byCourseCode.set(code, candidate);
            }
          }
        }

        for (const credit of priorCredits ?? []) {
          const code = String(credit.umd_course_code ?? credit.original_name ?? "PRIOR").toUpperCase();
          if (!code) continue;
          const genEds = Array.isArray(credit.gen_ed_codes) ? credit.gen_ed_codes.map(String) : [];
          if (genEds.length === 0) continue;

          byCourseCode.set(code, {
            code,
            title: String(credit.original_name ?? "Prior Credit"),
            termLabel: String(credit.term_awarded ?? "Prior Credit"),
            status: "completed",
            genEds,
          });
        }

        const byTag = new Map<string, TaggedCourse[]>();
        for (const course of byCourseCode.values()) {
          for (const tag of course.genEds) {
            const normalizedTag = String(tag).toUpperCase();
            if (!byTag.has(normalizedTag)) byTag.set(normalizedTag, []);
            byTag.get(normalizedTag)!.push(course);
          }
        }

        setCoursesByTag(byTag);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load Gen Ed progress.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadSamples = async () => {
      if (!selectedGenEd) {
        setSampleCourses([]);
        return;
      }

      setLoadingSamples(true);
      try {
        const now = getCurrentAcademicTerm();
        const fullTermCode = `${now.termYear}${now.termCode}`;
        const candidateTags = GEN_ED_SEARCH_TAGS[selectedGenEd.code] ?? [selectedGenEd.code];

        const attempts = ["", selectedGenEd.code, "ENGL", "MATH"];
        let found: Array<{ code: string; title: string; credits: number; genEds: string[] }> = [];

        for (const tag of candidateTags) {
          for (const query of attempts) {
            const result = await plannerApi.searchCourses(query, fullTermCode, tag);
            const mapped = result
              .filter((course) => candidateTags.some((candidateTag) => course.genEdTags?.includes(candidateTag)))
              .slice(0, 10)
              .map((course) => ({
                code: `${course.deptId}${course.number}`,
                title: course.title,
                credits: Number(course.credits ?? 0) || 0,
                genEds: course.genEdTags ?? [],
              }));

            if (mapped.length > 0) {
              found = mapped;
              break;
            }
          }

          if (found.length > 0) {
            break;
          }
        }

        if (!active) return;
        setSampleCourses(found);
      } catch {
        if (!active) return;
        setSampleCourses([]);
      } finally {
        if (active) setLoadingSamples(false);
      }
    };

    void loadSamples();
    return () => {
      active = false;
    };
  }, [selectedGenEd]);

  const genEdRows = useMemo(() => {
    const discoveredCodes = Array.from(coursesByTag.keys());
    const knownCodes = new Set(GEN_ED_FULFILLMENT_CONFIG.flatMap((g) => [g.code, ...g.sourceCodes]));

    const rows = buildGenEdRows(coursesByTag);
    const metadata = [...rows];
    for (const unknownCode of discoveredCodes) {
      if (!knownCodes.has(unknownCode)) {
        metadata.push({
          code: unknownCode,
          name: unknownCode,
          category: "Additional",
          required: 1,
          description: "Additional Gen Ed tag discovered from your saved courses.",
          status: "Completed",
          completed: Math.min(1, (coursesByTag.get(unknownCode) ?? []).filter((course) => course.status === "completed").length),
          remaining: 0,
          fulfilledBy: dedupeTaggedCourses(coursesByTag.get(unknownCode) ?? []),
        });
      }
    }

    return metadata;
  }, [coursesByTag]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(genEdRows.map((g) => g.category)))],
    [genEdRows],
  );

  const filteredData = useMemo(() => {
    return genEdRows.filter((item) => {
      if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (searchQuery.trim().length > 0) {
        const needle = searchQuery.toLowerCase();
        const target = `${item.code} ${item.name} ${item.description}`.toLowerCase();
        if (!target.includes(needle)) return false;
      }
      return true;
    });
  }, [categoryFilter, genEdRows, searchQuery, statusFilter]);

  const summaryByCategory = useMemo(() => {
    const byCategory = new Map<string, { total: number; completed: number }>();

    for (const row of genEdRows) {
      const current = byCategory.get(row.category) ?? { total: 0, completed: 0 };
      current.total += row.required;
      current.completed += row.completed;
      byCategory.set(row.category, current);
    }

    return {
      fundamental: byCategory.get("Fundamental Studies") ?? { total: 0, completed: 0 },
      distributive: byCategory.get("Distributive Studies") ?? { total: 0, completed: 0 },
      iSeries: byCategory.get("I-Series / Big Question") ?? { total: 0, completed: 0 },
      diversity: byCategory.get("Diversity") ?? { total: 0, completed: 0 },
    };
  }, [genEdRows]);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-foreground mb-2">General Education Progress</h1>
          <p className="text-muted-foreground">Live Gen Ed tracking from your MAIN schedules and prior credits.</p>
        </div>

        {loading && <p className="text-muted-foreground">Loading Gen Ed progress...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

        {!loading && !errorMessage && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="p-4 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-muted-foreground">Fundamental Studies</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-popover border-border">
                        <p>Core writing, communication, and reasoning requirements.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl text-foreground mb-2">{summaryByCategory.fundamental.completed} / {summaryByCategory.fundamental.total}</p>
                <Progress
                  value={summaryByCategory.fundamental.total === 0 ? 0 : (summaryByCategory.fundamental.completed / summaryByCategory.fundamental.total) * 100}
                  className="h-2"
                />
              </Card>

              <Card className="p-4 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-muted-foreground">Distributive Studies</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-popover border-border">
                        <p>Breadth requirements across sciences, social sciences, and humanities.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl text-foreground mb-2">{summaryByCategory.distributive.completed} / {summaryByCategory.distributive.total}</p>
                <Progress
                  value={summaryByCategory.distributive.total === 0 ? 0 : (summaryByCategory.distributive.completed / summaryByCategory.distributive.total) * 100}
                  className="h-2"
                />
              </Card>

              <Card className="p-4 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-muted-foreground">I-Series</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-popover border-border">
                        <p>Interdisciplinary big question courses.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl text-foreground mb-2">{summaryByCategory.iSeries.completed} / {summaryByCategory.iSeries.total}</p>
                <Progress
                  value={summaryByCategory.iSeries.total === 0 ? 0 : (summaryByCategory.iSeries.completed / summaryByCategory.iSeries.total) * 100}
                  className="h-2"
                />
              </Card>

              <Card className="p-4 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-muted-foreground">Diversity</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-popover border-border">
                        <p>Plural societies and cultural competence requirements.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl text-foreground mb-2">{summaryByCategory.diversity.completed} / {summaryByCategory.diversity.total}</p>
                <Progress
                  value={summaryByCategory.diversity.total === 0 ? 0 : (summaryByCategory.diversity.completed / summaryByCategory.diversity.total) * 100}
                  className="h-2"
                />
              </Card>
            </div>

            <Card className="p-4 bg-card border-border mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Category:</span>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-48 bg-input-background border-border">
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
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40 bg-input-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["All", "Completed", "In progress", "Not started"].map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 rounded-md border border-border bg-input-background px-3 text-sm text-foreground/80 placeholder:text-muted-foreground"
                  placeholder="Search Gen Ed code/name"
                />
              </div>
            </Card>

            <Card className="bg-card border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Gen Ed</TableHead>
                    <TableHead className="text-muted-foreground">Category</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground text-center">Required</TableHead>
                    <TableHead className="text-muted-foreground text-center">Completed</TableHead>
                    <TableHead className="text-muted-foreground text-center">Remaining</TableHead>
                    <TableHead className="text-muted-foreground">Fulfilled By</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow
                      key={item.code}
                      className={`border-border ${
                        item.status === "Completed" ? "bg-green-600/5" : item.status === "In progress" ? "bg-blue-600/5" : ""
                      }`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(item.status)}
                          <div>
                            <p className="text-foreground">{item.code}</p>
                            <p className="text-xs text-muted-foreground">{item.name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground/80">{item.category}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-center text-foreground">{item.required}</TableCell>
                      <TableCell className="text-center text-foreground">{item.completed}</TableCell>
                      <TableCell className="text-center text-foreground">{item.remaining}</TableCell>
                      <TableCell>
                        {item.fulfilledBy.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.fulfilledBy.slice(0, 3).map((course) => (
                              <Badge key={`${item.code}-${course.code}`} variant="outline" className="border-border text-xs">
                                {course.code} ({course.termLabel})
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedGenEd(item)}
                          className="border-border text-foreground/80 hover:bg-accent"
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

            {selectedGenEd && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="max-w-3xl w-full p-6 bg-card border-border max-h-[80vh] overflow-y-auto">
                  <div className="flex items-start justify-between mb-4 gap-4">
                    <div>
                      <h3 className="text-2xl text-foreground mb-1">{selectedGenEd.code} · {selectedGenEd.name}</h3>
                      <p className="text-muted-foreground mb-3">{selectedGenEd.description}</p>
                      <div className="flex gap-2 flex-wrap">
                        {getStatusBadge(selectedGenEd.status)}
                        <Badge variant="outline" className="border-border">{selectedGenEd.category}</Badge>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setSelectedGenEd(null)}
                      className="hover:bg-accent"
                    >
                      <XCircle className="w-5 h-5" />
                    </Button>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-foreground mb-2">Progress</h4>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">Required: {selectedGenEd.required}</span>
                      <span className="text-muted-foreground">Completed: {selectedGenEd.completed}</span>
                      <span className="text-muted-foreground">Remaining: {selectedGenEd.remaining}</span>
                    </div>
                  </div>

                  {selectedGenEd.fulfilledBy.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-foreground mb-3">Satisfied By Your Courses</h4>
                      <div className="space-y-2">
                        {selectedGenEd.fulfilledBy.map((course) => (
                          <div key={`${selectedGenEd.code}-${course.code}-${course.termLabel}`} className="p-3 bg-input-background rounded-lg border border-border">
                            <p className="text-foreground">{course.code} - {course.title}</p>
                            <p className="text-sm text-muted-foreground">{course.termLabel}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-foreground mb-3">Courses Matching {selectedGenEd.code}</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Live lookup for recent catalog offerings tagged with this Gen Ed requirement.
                    </p>
                    {loadingSamples ? (
                      <p className="text-muted-foreground">Loading matching courses...</p>
                    ) : sampleCourses.length === 0 ? (
                      <p className="text-muted-foreground">No sample courses were returned for this tag right now.</p>
                    ) : (
                      <div className="space-y-2">
                        {sampleCourses.map((course) => (
                          <div key={`${course.code}-${course.title}`} className="p-3 bg-input-background rounded-lg border border-border flex items-center justify-between gap-3">
                            <div>
                              <p className="text-foreground">{course.code} - {course.title}</p>
                              <p className="text-xs text-muted-foreground">{course.credits} credits</p>
                            </div>
                            <Badge variant="outline" className="border-red-600/40 text-red-300">{selectedGenEd.code}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-border">
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
          </>
        )}
      </div>
    </div>
  );
}
