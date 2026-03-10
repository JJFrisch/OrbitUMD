import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Info } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { CourseRowDisplay } from "../components/CourseRowDisplay";
import { plannerApi } from "@/lib/api/planner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { listUserDegreePrograms, loadCsSpecializationPreference, saveCsSpecializationPreference, type UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import {
  buildCourseContributionMap,
  evaluateRequirementSection,
  getCsRequirementSectionsForSpecialization,
  loadProgramRequirementBundles,
  type AuditCourseStatus,
  type ProgramRequirementBundle,
} from "@/lib/requirements/audit";

interface AuditCourse {
  code: string;
  title: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

function parseSelections(stored: unknown): Array<any> {
  const payload = (stored ?? []) as { selections?: any[] } | any[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function rank(status: AuditCourseStatus): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  if (status === "planned") return 1;
  return 0;
}

function mergeStatus(a: AuditCourseStatus, b: AuditCourseStatus): AuditCourseStatus {
  return rank(a) >= rank(b) ? a : b;
}

function statusBadge(status: AuditCourseStatus) {
  if (status === "completed") {
    return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">In Progress</Badge>;
  }
  return <Badge variant="outline" className="border-border">Planned</Badge>;
}

interface RequirementSectionCardProps {
  section: any; // RequirementSectionBundle
  sectionEval: any; // Section evaluation result
  allCourses: AuditCourse[]; // All available courses for lookup
  courseDetails: Map<string, CourseDetails>; // Course details from database
  byCourseCode: Map<string, AuditCourseStatus>; // Course code -> status map
  expandedSectionIds: Set<string>;
  setExpandedSectionIds: (prev: (s: Set<string>) => Set<string>) => void;
}

function RequirementSectionCard({
  section,
  sectionEval,
  allCourses,
  courseDetails,
  byCourseCode,
  expandedSectionIds,
  setExpandedSectionIds,
}: RequirementSectionCardProps) {
  // Get courses for this section, enriched with database details
  const sectionCourses = useMemo(() => {
    const coursesByCode = new Map(allCourses.map((c) => [c.code.toUpperCase(), c]));
    const courses: AuditCourse[] = [];

    // Add courses from the section's course list
    for (const code of section.courseCodes) {
      const baseCode = code.toUpperCase();
      const auditCourse = coursesByCode.get(baseCode);
      const details = courseDetails.get(baseCode);

      if (auditCourse && details) {
        // Merge audit course with database details
        courses.push({
          ...auditCourse,
          title: details.title || auditCourse.title,
          credits: details.credits || auditCourse.credits,
          genEds: details.genEds || auditCourse.genEds,
        });
      } else if (details) {
        // Use database details only
        const status = byCourseCode.get(baseCode) ?? "not_started";
        courses.push({
          code: details.code,
          title: details.title,
          credits: details.credits,
          genEds: details.genEds,
          status,
        });
      } else if (auditCourse) {
        // Use audit course
        courses.push(auditCourse);
      } else {
        // Placeholder course
        const status = byCourseCode.get(baseCode) ?? "not_started";
        courses.push({
          code: baseCode,
          title: `${baseCode}`,
          credits: 0,
          genEds: [],
          status,
        });
      }
    }

    return courses;
  }, [section, allCourses, courseDetails, byCourseCode]);

  return (
    <Card className="bg-input-background border-border p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-foreground">{section.title}</h3>
          {section.special && (
            <Badge className="bg-purple-600/20 text-purple-300 border border-purple-600/30">Specialization/Choose</Badge>
          )}
          {section.requirementType === "choose" && (
            <Badge className="bg-amber-600/20 text-amber-300 border border-amber-600/30">Choose {section.chooseCount ?? 1}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(sectionEval.status)}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              setExpandedSectionIds((prev) => {
                const next = new Set(prev);
                if (next.has(section.id)) next.delete(section.id);
                else next.add(section.id);
                return next;
              });
            }}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expandedSectionIds.has(section.id) ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {expandedSectionIds.has(section.id) ? (
        <>
          {sectionCourses.length > 0 ? (
            // Show individual course rows
            <div className="mt-3 border border-border/30 rounded-md overflow-hidden">
              {sectionCourses.map((course) => (
                <CourseRowDisplay
                  key={course.code}
                  courseCode={course.code}
                  courseTitle={course.title}
                  credits={course.credits}
                  genEds={course.genEds}
                  status={course.status}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-3">No courses in this section.</p>
          )}

          {section.notes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">Notes:</p>
              <ul className="space-y-1">
                {section.notes.map((note, idx) => (
                  <li key={`${section.id}-note-${idx}`} className="text-xs text-foreground/70">• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Collapsed. Tap to expand course details.</p>
      )}
    </Card>
  );
}

export default function DegreeAudit() {
  const [programs, setPrograms] = useState<UserDegreeProgram[]>([]);
  const [bundles, setBundles] = useState<ProgramRequirementBundle[]>([]);
  const [courses, setCourses] = useState<AuditCourse[]>([]);
  const [courseDetails, setCourseDetails] = useState<Map<string, CourseDetails>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProgramIndex, setActiveProgramIndex] = useState(0);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [expandedStorageKey, setExpandedStorageKey] = useState("orbitumd:audit-expanded:anon");
  const [expandedLoaded, setExpandedLoaded] = useState(false);
  const [selectedSpecialization, setSelectedSpecialization] = useState<Map<number, string>>(new Map());
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const scrollToProgram = (index: number) => {
    const slider = sliderRef.current;
    const child = slider?.children[index] as HTMLElement | undefined;
    if (!slider || !child) return;
    slider.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setExpandedStorageKey(`orbitumd:audit-expanded:${data.user?.id ?? "anon"}`);

        // Load saved CS specialization preference
        const savedSpecialization = await loadCsSpecializationPreference();
        if (active && savedSpecialization) {
          // Set to first CS major program (index 0 for now; could be enhanced)
          setSelectedSpecialization((prev) => {
            const next = new Map(prev);
            next.set(0, savedSpecialization);
            return next;
          });
        }
      } catch {
        if (active) setExpandedStorageKey("orbitumd:audit-expanded:anon");
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(expandedStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setExpandedSectionIds(new Set(Array.isArray(parsed) ? parsed.map(String) : []));
    } catch {
      setExpandedSectionIds(new Set());
    } finally {
      setExpandedLoaded(true);
    }
  }, [expandedStorageKey]);

  useEffect(() => {
    if (!expandedLoaded) return;
    localStorage.setItem(expandedStorageKey, JSON.stringify(Array.from(expandedSectionIds)));
  }, [expandedLoaded, expandedSectionIds, expandedStorageKey]);

  // Handle specialization selection changes
  useEffect(() => {
    if (bundles.length === 0) return;

    const updatedBundles = bundles.map((bundle, index) => {
      if (bundle.source !== "cs-specialized") return bundle;

      const selectedSpecId = selectedSpecialization.get(index);
      const newSections = getCsRequirementSectionsForSpecialization(selectedSpecId);

      return {
        ...bundle,
        sections: newSections,
      };
    });

    setBundles(updatedBundles);
    // Note: only depend on selectedSpecialization, not bundles, to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecialization]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const [selectedPrograms, schedules, priorCredits] = await Promise.all([
          listUserDegreePrograms(),
          plannerApi.listAllSchedulesWithSelections(),
          listUserPriorCredits(),
        ]);

        if (!active) return;

        const mainSchedules = schedules.filter((schedule) => schedule.is_primary && schedule.term_code && schedule.term_year);

        const byCode = new Map<string, AuditCourse>();
        for (const schedule of mainSchedules) {
          const scheduleStatus = getAcademicProgressStatus({
            termCode: schedule.term_code!,
            termYear: schedule.term_year!,
          });

          for (const selection of parseSelections(schedule.selections_json)) {
            const code = String(selection?.course?.courseCode ?? "").toUpperCase();
            if (!code) continue;

            const current: AuditCourse = {
              code,
              title: String(selection?.course?.name ?? "Untitled Course"),
              credits: Number(selection?.course?.maxCredits ?? selection?.course?.credits ?? 0) || 0,
              genEds: Array.isArray(selection?.course?.genEds) ? selection.course.genEds : [],
              status: scheduleStatus,
            };

            const existing = byCode.get(code);
            if (!existing) {
              byCode.set(code, current);
            } else {
              byCode.set(code, {
                ...existing,
                credits: Math.max(existing.credits, current.credits),
                title: existing.title || current.title,
                genEds: Array.from(new Set([...(existing.genEds ?? []), ...(current.genEds ?? [])])),
                status: mergeStatus(existing.status, current.status),
              });
            }
          }
        }

        for (const credit of priorCredits) {
          const creditCodes = String(credit.umdCourseCode ?? "")
            .split(/[|,]/)
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);

          if (creditCodes.length === 0) {
            creditCodes.push(`PRIOR:${credit.id}`);
          }

          for (const code of creditCodes) {
            const current: AuditCourse = {
              code,
              title: credit.originalName,
              credits: Number(credit.credits ?? 0) || 0,
              genEds: Array.isArray(credit.genEdCodes) ? credit.genEdCodes : [],
              status: "completed",
            };

            const existing = byCode.get(code);
            if (!existing) {
              byCode.set(code, current);
            } else {
              byCode.set(code, {
                ...existing,
                credits: Math.max(existing.credits, current.credits),
                title: existing.title || current.title,
                genEds: Array.from(new Set([...(existing.genEds ?? []), ...(current.genEds ?? [])])),
                status: mergeStatus(existing.status, current.status),
              });
            }
          }
        }

        const auditCourses = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
        const loadedBundles = await loadProgramRequirementBundles(selectedPrograms);
        if (!active) return;

        setPrograms(selectedPrograms);
        setBundles(loadedBundles);
        setCourses(auditCourses);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load degree audit.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  // Load course details from database
  useEffect(() => {
    let active = true;

    const run = async () => {
      // Collect all course codes from all bundles
      const allCourseCodes = new Set<string>();
      for (const bundle of bundles) {
        for (const section of bundle.sections) {
          for (const code of section.courseCodes) {
            allCourseCodes.add(code.toUpperCase());
          }
        }
      }

      if (allCourseCodes.size === 0) return;

      try {
        const details = await lookupCourseDetails(Array.from(allCourseCodes));
        if (active) {
          setCourseDetails(details);
        }
      } catch (error) {
        console.error("Failed to load course details:", error);
        // Continue without course details rather than failing
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [bundles]);

  const byCourseCode = useMemo(() => {
    const map = new Map<string, AuditCourseStatus>();
    for (const course of courses) {
      map.set(course.code, course.status);
    }
    return map;
  }, [courses]);

  const contributionMap = useMemo(() => buildCourseContributionMap(bundles), [bundles]);

  const summary = useMemo(() => {
    let completedCredits = 0;
    let inProgressCredits = 0;
    let plannedCredits = 0;

    for (const course of courses) {
      if (course.status === "completed") completedCredits += course.credits;
      else if (course.status === "in_progress") inProgressCredits += course.credits;
      else plannedCredits += course.credits;
    }

    const totalCredits = completedCredits + inProgressCredits + plannedCredits;
    return {
      totalCredits,
      completedCredits,
      inProgressCredits,
      plannedCredits,
    };
  }, [courses]);

  const programAudits = useMemo(() => {
    return bundles.map((bundle) => {
      const sectionRows = bundle.sections.map((section) => ({
        section,
        eval: evaluateRequirementSection(section, byCourseCode),
      }));

      const requiredSlots = sectionRows.reduce((sum, row) => sum + row.eval.requiredSlots, 0);
      const completedSlots = sectionRows.reduce((sum, row) => sum + row.eval.completedSlots, 0);
      const inProgressSlots = sectionRows.reduce((sum, row) => sum + row.eval.inProgressSlots, 0);
      const plannedSlots = sectionRows.reduce((sum, row) => sum + row.eval.plannedSlots, 0);

      let status: AuditCourseStatus = "not_started";
      if (completedSlots >= requiredSlots) status = "completed";
      else if (completedSlots + inProgressSlots >= requiredSlots) status = "in_progress";
      else if (completedSlots + inProgressSlots + plannedSlots >= requiredSlots) status = "planned";

      return {
        bundle,
        sectionRows,
        requiredSlots,
        completedSlots,
        inProgressSlots,
        plannedSlots,
        status,
        progressPercent: requiredSlots === 0 ? 0 : Math.round(((completedSlots + inProgressSlots) / requiredSlots) * 100),
      };
    });
  }, [bundles, byCourseCode]);

  const electiveOverflow = useMemo(() => {
    return courses.filter((course) => {
      const contributes = (contributionMap.get(course.code) ?? []).length > 0;
      return !contributes;
    });
  }, [contributionMap, courses]);

  const electiveCredits = electiveOverflow.reduce((sum, course) => sum + course.credits, 0);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-foreground mb-2">Degree Audit</h1>
          <p className="text-muted-foreground">
            Live audit powered by selected major/minor requirements and your MAIN schedules.
          </p>
        </div>

        {loading && <p className="text-muted-foreground">Running degree audit...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

        {!loading && !errorMessage && (
          <>
            <Card className="p-6 bg-card border-border mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm text-muted-foreground">Total Credits</h3>
                  </div>
                  <p className="text-3xl text-foreground">{summary.totalCredits}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <h3 className="text-sm text-muted-foreground">Completed</h3>
                  </div>
                  <p className="text-3xl text-foreground">{summary.completedCredits} cr</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm text-muted-foreground">In Progress</h3>
                  </div>
                  <p className="text-3xl text-foreground">{summary.inProgressCredits} cr</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm text-muted-foreground">Planned</h3>
                  </div>
                  <p className="text-3xl text-foreground">{summary.plannedCredits} cr</p>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-6 border-t border-border">
                <Link to="/four-year-plan" className="flex-1">
                  <Button variant="outline" className="w-full border-border text-foreground/80 hover:bg-accent">
                    Open Four-Year Plan
                  </Button>
                </Link>
                <Link to="/degree-requirements" className="flex-1">
                  <Button className="w-full bg-red-600 hover:bg-red-700">Review Requirement Details</Button>
                </Link>
              </div>
            </Card>

            {programAudits.length > 0 && (
              <Card className="bg-card border-border mb-6 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-xl text-foreground">Program Audits</h2>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="border-border"
                      onClick={() => {
                        const next = Math.max(0, activeProgramIndex - 1);
                        setActiveProgramIndex(next);
                        scrollToProgram(next);
                      }}
                      disabled={activeProgramIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="border-border"
                      onClick={() => {
                        const next = Math.min(programAudits.length - 1, activeProgramIndex + 1);
                        setActiveProgramIndex(next);
                        scrollToProgram(next);
                      }}
                      disabled={activeProgramIndex === programAudits.length - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {programAudits.map((programAudit, index) => (
                    <Button
                      key={`tab-${programAudit.bundle.programId}-${index}`}
                      variant={index === activeProgramIndex ? "default" : "outline"}
                      className={index === activeProgramIndex ? "bg-red-600 hover:bg-red-700" : "border-border text-foreground/80"}
                      onClick={() => {
                        setActiveProgramIndex(index);
                        scrollToProgram(index);
                      }}
                    >
                      {programAudit.bundle.kind.toUpperCase()}: {programAudit.bundle.programName}
                    </Button>
                  ))}
                </div>

                <div
                  ref={sliderRef}
                  className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2"
                  onScroll={(event) => {
                    const target = event.currentTarget;
                    const width = target.clientWidth || 1;
                    const idx = Math.round(target.scrollLeft / width);
                    if (idx !== activeProgramIndex) {
                      setActiveProgramIndex(Math.min(Math.max(idx, 0), programAudits.length - 1));
                    }
                  }}
                >
                  {programAudits.map((programAudit, index) => (
                    <div key={`${programAudit.bundle.programId}-${index}`} className="min-w-full snap-start">
                      <Card className="bg-card border-border p-5">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <h2 className="text-2xl text-foreground">{programAudit.bundle.programName}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              {programAudit.bundle.kind.toUpperCase()} - {programAudit.bundle.source === "db" ? "custom saved rules" : "catalog scraped rules"}
                            </p>
                          </div>
                          {statusBadge(programAudit.status)}
                        </div>

                        <div className="flex items-center gap-4 mb-5">
                          <Progress value={programAudit.progressPercent} className="flex-1 h-3" />
                          <span className="text-foreground text-sm">
                            {Math.round((programAudit.completedSlots + programAudit.inProgressSlots) / 3)} / {Math.round(programAudit.requiredSlots / 3)} courses active
                          </span>
                        </div>

                        {programAudit.bundle.specializationOptions && programAudit.bundle.specializationOptions.length > 0 && (
                          <div className="mb-5 p-4 bg-input-background border border-border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-2">Choose a specialization:</p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={!selectedSpecialization.has(index) ? "default" : "outline"}
                                className={!selectedSpecialization.has(index) ? "bg-red-600 hover:bg-red-700" : "border-border text-foreground/80"}
                                onClick={() => {
                                  setSelectedSpecialization((prev) => {
                                    const next = new Map(prev);
                                    next.delete(index);
                                    return next;
                                  });
                                  if (programAudit.bundle.source === "cs-specialized") {
                                    void saveCsSpecializationPreference(null);
                                  }
                                }}
                              >
                                {programAudit.bundle.source === "cs-specialized" ? "General Track" : "Core Requirements Only"}
                              </Button>
                              {programAudit.bundle.specializationOptions.map((spec) => (
                                <Button
                                  key={spec.id}
                                  size="sm"
                                  variant={selectedSpecialization.get(index) === spec.id ? "default" : "outline"}
                                  className={selectedSpecialization.get(index) === spec.id ? "bg-red-600 hover:bg-red-700" : "border-border text-foreground/80"}
                                  onClick={() => {
                                    setSelectedSpecialization((prev) => {
                                      const next = new Map(prev);
                                      next.set(index, spec.id);
                                      return next;
                                    });
                                    if (programAudit.bundle.source === "cs-specialized") {
                                      void saveCsSpecializationPreference(spec.id);
                                    }
                                  }}
                                >
                                  {spec.name}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          {(() => {
                            // Get selected specialization for this program
                            const selectedSpecId = selectedSpecialization.get(index);
                            const selectedSpec = programAudit.bundle.specializationOptions?.find(
                              (spec) => spec.id === selectedSpecId
                            );

                            // Separate base and specialization sections
                            const baseSections = programAudit.sectionRows.filter(
                              ({ section }) => !section.specializationId
                            );
                            const specializationSections = programAudit.sectionRows.filter(
                              ({ section }) => section.specializationId && section.specializationId === selectedSpecId
                            );

                            return (
                              <>
                                {/* Base requirements */}
                                {baseSections.map(({ section, eval: sectionEval }) => (
                                  <RequirementSectionCard
                                    key={section.id}
                                    section={section}
                                    sectionEval={sectionEval}
                                    allCourses={courses}
                                    courseDetails={courseDetails}
                                    byCourseCode={byCourseCode}
                                    expandedSectionIds={expandedSectionIds}
                                    setExpandedSectionIds={setExpandedSectionIds}
                                  />
                                ))}

                                {programAudit.bundle.specializationOptions && programAudit.bundle.specializationOptions.length > 0 && !selectedSpecId && (
                                  <Card className="bg-input-background border-border p-3">
                                    <p className="text-sm text-muted-foreground">
                                      Select a specialization above to view track-specific requirements.
                                    </p>
                                  </Card>
                                )}

                                {/* Specialization-specific sections */}
                                {specializationSections.length > 0 && selectedSpec && (
                                  <div className="mt-6 pt-4 border-t border-border">
                                    <h3 className="text-lg text-foreground mb-3 font-semibold">
                                      Specialization Requirements: {selectedSpec.name}
                                    </h3>
                                    <div className="space-y-3">
                                      {specializationSections.map(({ section, eval: sectionEval }) => (
                                        <RequirementSectionCard
                                          key={section.id}
                                          section={section}
                                          sectionEval={sectionEval}
                                          allCourses={courses}
                                          courseDetails={courseDetails}
                                          byCourseCode={byCourseCode}
                                          expandedSectionIds={expandedSectionIds}
                                          setExpandedSectionIds={setExpandedSectionIds}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  {programAudits.map((programAudit, index) => (
                    <button
                      key={`dot-${programAudit.bundle.programId}-${index}`}
                      type="button"
                      aria-label={`Go to ${programAudit.bundle.programName}`}
                      onClick={() => {
                        setActiveProgramIndex(index);
                        scrollToProgram(index);
                      }}
                      className={`h-2.5 w-2.5 rounded-full transition-colors ${index === activeProgramIndex ? "bg-red-500" : "bg-neutral-600 hover:bg-neutral-500"}`}
                    />
                  ))}
                </div>
              </Card>
            )}

            <Card className="bg-card border-border mt-6 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl text-foreground">Elective Overflow</h2>
                <Badge variant="outline" className="border-border text-foreground/80">{electiveCredits} credits</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Courses below currently do not map to selected major/minor requirements.
              </p>

              {electiveOverflow.length === 0 ? (
                <div className="p-3 rounded-lg bg-input-background border border-border text-foreground/80">
                  No overflow electives detected.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {electiveOverflow.map((course) => (
                    <Card key={course.code} className="bg-input-background border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-foreground">{course.code}</p>
                          <p className="text-xs text-muted-foreground">{course.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-foreground">{course.credits} cr</p>
                          <p className="text-xs text-muted-foreground">{course.status.replace("_", " ")}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>

            <Card className="bg-card border-border mt-6 p-4">
              <div className="flex items-center gap-2 text-foreground/80">
                <Info className="w-4 h-4" />
                <p className="text-sm">
                  Audit status is driven by MAIN schedules only: past terms = completed, current term = in progress, future terms = planned.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
