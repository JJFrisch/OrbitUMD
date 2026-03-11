import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Cloud, CloudOff, FileText, Info, Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { CourseRowDisplay } from "../components/CourseRowDisplay";
import { plannerApi } from "@/lib/api/planner";
import { listUserDegreePrograms, loadCsSpecializationPreference, saveCsSpecializationPreference, type UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { listUserRequirementSectionEdits, saveUserRequirementSectionEdit } from "@/lib/repositories/userRequirementSectionEditsRepository";
import { getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { getCurrentTermCode, lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";
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

interface EditableLogicBlock {
  id: string;
  type: "AND" | "OR";
  codes: string[];
}

interface SectionDraft {
  id?: string;
  title: string;
  requirementType: "all" | "choose";
  chooseCount?: number;
  notesText: string;
  blocks: EditableLogicBlock[];
}

interface CourseSearchResult {
  id?: string;
  code: string;
  title: string;
}

type SectionEditSyncState = "idle" | "saving" | "synced" | "local";

const CUSTOM_AUDIT_SECTIONS_KEY = "orbitumd:audit-custom-sections:v1";
const WILDCARD_SELECTIONS_KEY = "orbitumd:audit-wildcard-selections:v1";

function normalizeProgramName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(major|minor|program|bachelor|science|arts|bs|ba)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCatalogRequirementsUrl(bundle: ProgramRequirementBundle): string | null {
  if (bundle.source !== "scraped") return null;

  const target = normalizeProgramName(bundle.programName);
  if (!target) return null;

  const entries = ((requirementsCatalog as any)?.programs ?? []) as Array<{
    name?: string;
    type?: string;
    requirementsUrl?: string;
    programUrl?: string;
  }>;

  const targetType = bundle.kind === "minor" ? "minor" : "major";
  const matched = entries.find((entry) => {
    const entryName = normalizeProgramName(String(entry.name ?? ""));
    if (!entryName) return false;
    const entryType = entry.type === "minor" ? "minor" : "major";
    if (entryType !== targetType) return false;
    return entryName === target || entryName.includes(target) || target.includes(entryName);
  });

  return matched?.requirementsUrl ?? matched?.programUrl ?? null;
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromSection(section: any): SectionDraft {
  const blocks = (section.logicBlocks?.length ? section.logicBlocks : section.optionGroups?.map((codes: string[]) => ({ type: "OR", codes })) ?? [])
    .map((block: { type: "AND" | "OR"; codes: string[] }, idx: number) => ({
      id: createLocalId(`blk-${idx}`),
      type: block.type,
      codes: [...new Set((block.codes ?? []).map((code) => String(code).toUpperCase().trim()).filter(Boolean))],
    }));

  return {
    id: section.id,
    title: section.title ?? "",
    requirementType: section.requirementType ?? "all",
    chooseCount: section.chooseCount,
    notesText: (section.notes ?? []).join("\n"),
    blocks,
  };
}

function sectionFromDraft(draft: SectionDraft, existingSectionId?: string) {
  const normalizedBlocks = draft.blocks
    .map((block) => ({
      type: block.type,
      codes: [...new Set(block.codes.map((code) => code.toUpperCase().trim()).filter(Boolean))],
    }))
    .filter((block) => block.codes.length > 0);

  const optionGroups = normalizedBlocks.filter((b) => b.type === "OR").map((b) => b.codes);
  const standaloneCodes = normalizedBlocks.filter((b) => b.type === "AND").flatMap((b) => b.codes);
  const courseCodes = [...new Set([...optionGroups.flat(), ...standaloneCodes])];
  const notes = draft.notesText.split("\n").map((line) => line.trim()).filter(Boolean);

  return {
    id: existingSectionId ?? draft.id ?? createLocalId("section"),
    title: draft.title.trim() || "Untitled Section",
    requirementType: draft.requirementType,
    chooseCount: draft.requirementType === "choose" ? Math.max(1, Number(draft.chooseCount ?? 1)) : undefined,
    notes,
    special: normalizedBlocks.some((b) => b.type === "OR") || draft.requirementType === "choose",
    courseCodes,
    optionGroups,
    standaloneCodes,
    logicBlocks: normalizedBlocks,
  };
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
    return <Badge className="bg-green-100 text-green-900 border border-green-300 dark:bg-green-600/20 dark:text-green-300 dark:border-green-600/30">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-600/30">In Progress</Badge>;
  }
  return <Badge variant="outline" className="border-border">Planned</Badge>;
}

function sectionHeaderClass(sectionEval: { requiredSlots: number; completedSlots: number; inProgressSlots: number }): string {
  if (sectionEval.requiredSlots > 0 && sectionEval.completedSlots >= sectionEval.requiredSlots) {
    return "text-green-500";
  }
  if (sectionEval.completedSlots > 0 || sectionEval.inProgressSlots > 0) {
    return "text-blue-500";
  }
  return "text-foreground";
}

interface WildcardRule {
  token: string;
  departments: string[];
  minLevel?: number;
  maxLevel?: number;
}

interface WildcardSlotOption {
  code: string;
  title: string;
  status: AuditCourseStatus;
}

interface WildcardSlotMeta {
  key: string;
  token: string;
  options: WildcardSlotOption[];
  selectedCode?: string;
  effectiveCode?: string;
}

function parseWildcardRule(raw: string): WildcardRule | null {
  const token = String(raw ?? "").toUpperCase().trim();

  const levelRange = token.match(/^([A-Z]{4})4XX$/);
  if (levelRange) {
    return {
      token,
      departments: [levelRange[1]],
      minLevel: 400,
      maxLevel: 499,
    };
  }

  const anyLevel = token.match(/^([A-Z]{4}(?:\/[A-Z]{4})*)XXX$/);
  if (anyLevel) {
    return {
      token,
      departments: anyLevel[1].split("/").map((part) => part.toUpperCase()),
    };
  }

  return null;
}

function parseCourseCode(raw: string): { department: string; level: number } | null {
  const normalized = String(raw ?? "").toUpperCase().trim();
  const match = normalized.match(/^([A-Z]{4})(\d{3})[A-Z]?$/);
  if (!match) return null;
  return {
    department: match[1],
    level: Number(match[2]),
  };
}

function courseMatchesWildcardRule(courseCode: string, rule: WildcardRule): boolean {
  const parsed = parseCourseCode(courseCode);
  if (!parsed) return false;
  if (!rule.departments.includes(parsed.department)) return false;
  if (typeof rule.minLevel === "number" && parsed.level < rule.minLevel) return false;
  if (typeof rule.maxLevel === "number" && parsed.level > rule.maxLevel) return false;
  return true;
}

interface RequirementSectionCardProps {
  section: any; // RequirementSectionBundle
  sectionEval: any; // Section evaluation result
  wildcardSlots?: WildcardSlotMeta[];
  onSelectWildcardCourse?: (slotKey: string, courseCode: string) => void;
  allCourses: AuditCourse[]; // All available courses for lookup
  courseDetails: Map<string, CourseDetails>; // Course details from database
  byCourseCode: Map<string, AuditCourseStatus>; // Course code -> status map
  expandedSectionIds: Set<string>;
  setExpandedSectionIds: (prev: (s: Set<string>) => Set<string>) => void;
  onEdit?: (section: any) => void;
}

function RequirementSectionCard({
  section,
  sectionEval,
  wildcardSlots = [],
  onSelectWildcardCourse,
  allCourses,
  courseDetails,
  byCourseCode,
  expandedSectionIds,
  setExpandedSectionIds,
  onEdit,
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
          <h3 className={sectionHeaderClass(sectionEval)}>{section.title}</h3>
          {section.special && (
            <Badge className="bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-600/20 dark:text-purple-300 dark:border-purple-600/30">Specialization/Choose</Badge>
          )}
          {section.requirementType === "choose" && (
            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-600/30">Choose {section.chooseCount ?? 1}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border text-foreground/80"
              onClick={() => onEdit(section)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
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

      {wildcardSlots.length > 0 && (
        <div className="mb-3 rounded-md border border-border/40 bg-input-background p-3">
          <p className="text-xs text-muted-foreground mb-2">Wildcard requirement slots</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {wildcardSlots.map((slot) => (
              <label key={slot.key} className="text-xs text-muted-foreground flex flex-col gap-1">
                <span>{slot.token}</span>
                <select
                  className="h-8 rounded-md border border-input bg-input-background px-2 text-xs text-foreground"
                  value={slot.selectedCode ?? ""}
                  onChange={(event) => onSelectWildcardCourse?.(slot.key, event.target.value)}
                >
                  <option value="">Auto-select best match</option>
                  {slot.options.map((option) => (
                    <option key={`${slot.key}-${option.code}`} value={option.code}>
                      {option.code} - {option.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

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
  const [selectedSpecialization, setSelectedSpecialization] = useState<Map<number, string>>(new Map());
  const [editingProgramIndex, setEditingProgramIndex] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [activeDraftBlockId, setActiveDraftBlockId] = useState<string | null>(null);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchPending, setCourseSearchPending] = useState(false);
  const [courseSearchResults, setCourseSearchResults] = useState<CourseSearchResult[]>([]);
  const [courseSearchMessage, setCourseSearchMessage] = useState<string | null>(null);
  const [customSectionsByProgram, setCustomSectionsByProgram] = useState<Record<string, any[]>>({});
  const [wildcardSelections, setWildcardSelections] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(WILDCARD_SELECTIONS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
    } catch { /* noop */ }
    return {};
  });
  const [sectionEditSyncState, setSectionEditSyncState] = useState<SectionEditSyncState>("idle");
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const editorCardRef = useRef<HTMLDivElement | null>(null);
  const saveRequestIdRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_AUDIT_SECTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, any[]>;
      if (parsed && typeof parsed === "object") {
        setCustomSectionsByProgram(parsed);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const serverEdits = await listUserRequirementSectionEdits();
        if (!active) return;
        setCustomSectionsByProgram((prev) => ({
          ...prev,
          ...serverEdits,
        }));
        setSectionEditSyncState("synced");
      } catch {
        // Keep local fallback only if remote persistence is unavailable.
        if (active) setSectionEditSyncState("local");
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_AUDIT_SECTIONS_KEY, JSON.stringify(customSectionsByProgram));
    } catch {
      // noop
    }
  }, [customSectionsByProgram]);

  useEffect(() => {
    try {
      localStorage.setItem(WILDCARD_SELECTIONS_KEY, JSON.stringify(wildcardSelections));
    } catch {
      // noop
    }
  }, [wildcardSelections]);

  const scrollToProgram = (index: number) => {
    const slider = sliderRef.current;
    const child = slider?.children[index] as HTMLElement | undefined;
    if (!slider || !child) return;
    slider.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
  };

  const resetDraftEditor = () => {
    setEditingSectionId(null);
    setSectionDraft(null);
    setActiveDraftBlockId(null);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
  };

  const startEditingSection = (programIndex: number, section: any) => {
    const draft = draftFromSection(section);
    setEditingProgramIndex(programIndex);
    setEditingSectionId(section.id);
    setSectionDraft(draft);
    setActiveDraftBlockId(draft.blocks[0]?.id ?? null);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
  };

  const startAddingSection = (programIndex: number) => {
    const blockId = createLocalId("block");
    setEditingProgramIndex(programIndex);
    setEditingSectionId(null);
    setSectionDraft({
      title: "",
      requirementType: "all",
      chooseCount: 1,
      notesText: "",
      blocks: [{ id: blockId, type: "AND", codes: [] }],
    });
    setActiveDraftBlockId(blockId);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
  };

  const persistProgramSections = (programId: string, sections: any[]) => {
    setCustomSectionsByProgram((prev) => ({
      ...prev,
      [programId]: sections,
    }));
    setBundles((prev) => prev.map((bundle) => (
      bundle.programId === programId
        ? { ...bundle, sections }
        : bundle
    )));

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSectionEditSyncState("saving");

    void saveUserRequirementSectionEdit(programId, sections)
      .then(() => {
        if (saveRequestIdRef.current === requestId) {
          setSectionEditSyncState("synced");
        }
      })
      .catch(() => {
        // Ignore remote save failures; local persistence still keeps edits.
        if (saveRequestIdRef.current === requestId) {
          setSectionEditSyncState("local");
        }
      });
  };

  const runCourseSearch = async () => {
    if (!courseSearchQuery.trim()) {
      setCourseSearchResults([]);
      setCourseSearchMessage("Enter a course code or title to search.");
      return;
    }

    setCourseSearchPending(true);
    setCourseSearchMessage(null);
    try {
      const termCode = await getCurrentTermCode();
      const results = await plannerApi.searchCourses(courseSearchQuery.trim(), termCode);
      const mapped = (results ?? []).map((course) => ({
        id: course.id,
        code: String(course.id ?? "").toUpperCase(),
        title: String(course.title ?? "Untitled"),
      })).filter((course) => course.code);

      setCourseSearchResults(mapped.slice(0, 20));
      if (mapped.length === 0) {
        setCourseSearchMessage("No courses found.");
      }
    } catch {
      setCourseSearchMessage("Course search failed. Try again.");
      setCourseSearchResults([]);
    } finally {
      setCourseSearchPending(false);
    }
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        // Load saved CS specialization preference.
        const savedSpecialization = await loadCsSpecializationPreference();
        if (active && savedSpecialization) {
          // Set to first CS major program (index 0 for now; could be enhanced).
          setSelectedSpecialization((prev) => {
            const next = new Map(prev);
            next.set(0, savedSpecialization);
            return next;
          });
        }
      } catch {
        // noop
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (bundles.length === 0) return;
    const ids = bundles.flatMap((bundle) => bundle.sections.map((section) => String(section.id)));
    setExpandedSectionIds(new Set(ids));
  }, [bundles]);

  useEffect(() => {
    if (editingProgramIndex === null || !sectionDraft) return;
    editorCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingProgramIndex, sectionDraft]);

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

        const withCustomSections = loadedBundles.map((bundle) => {
          const customSections = customSectionsByProgram[bundle.programId];
          if (!customSections || customSections.length === 0) {
            return bundle;
          }
          return { ...bundle, sections: customSections };
        });

        setPrograms(selectedPrograms);
        setBundles(withCustomSections);
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
  }, [customSectionsByProgram]);

  useEffect(() => {
    if (bundles.length === 0) return;
    setBundles((prev) => prev.map((bundle) => {
      const customSections = customSectionsByProgram[bundle.programId];
      if (!customSections || customSections.length === 0) return bundle;
      if (bundle.sections === customSections) return bundle;
      return { ...bundle, sections: customSections };
    }));
  }, [customSectionsByProgram]);

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
    const majorProgramCount = bundles.filter((bundle) => bundle.kind === "major").length;
    const requiredCredits = majorProgramCount >= 2 ? 150 : 120;

    return {
      totalCredits,
      completedCredits,
      inProgressCredits,
      plannedCredits,
      requiredCredits,
    };
  }, [courses, bundles]);

  const programAudits = useMemo(() => {
    return bundles.map((bundle) => {
      const explicitCodesInProgram = new Set(
        bundle.sections
          .flatMap((section) => section.courseCodes)
          .map((code) => String(code).toUpperCase())
          .filter((code) => !parseWildcardRule(code))
      );

      const statusOrder: AuditCourseStatus[] = ["completed", "in_progress", "planned", "not_started"];
      const rank = (status: AuditCourseStatus) => statusOrder.indexOf(status);

      const sectionRows = bundle.sections.map((section) => {
        const wildcardRules = section.courseCodes
          .map((code) => parseWildcardRule(code))
          .filter((rule): rule is WildcardRule => Boolean(rule));

        const wildcardSlots: WildcardSlotMeta[] = wildcardRules.map((rule, idx) => {
          const slotKey = `${bundle.programId}:${section.id}:${idx}:${rule.token}`;
          const selectedCode = wildcardSelections[slotKey];

          const options = courses
            .filter((course) => {
              const normalizedCode = course.code.toUpperCase();
              if (explicitCodesInProgram.has(normalizedCode)) return false;
              return courseMatchesWildcardRule(normalizedCode, rule);
            })
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((course) => ({
              code: course.code.toUpperCase(),
              title: course.title,
              status: course.status,
            }));

          const best = [...options].sort((a, b) => rank(a.status) - rank(b.status))[0];
          const effectiveCode = options.some((option) => option.code === selectedCode)
            ? selectedCode
            : best?.code;

          return {
            key: slotKey,
            token: rule.token,
            options,
            selectedCode,
            effectiveCode,
          };
        });

        const wildcardStatuses = wildcardSlots
          .map((slot) => byCourseCode.get(String(slot.effectiveCode ?? "").toUpperCase()) ?? "not_started")
          .filter((status) => status !== "not_started" || wildcardSlots.length > 0);

        const baseEval = evaluateRequirementSection(section, byCourseCode);
        const slotStatuses = [
          ...Array(baseEval.completedSlots).fill("completed" as AuditCourseStatus),
          ...Array(baseEval.inProgressSlots).fill("in_progress" as AuditCourseStatus),
          ...Array(baseEval.plannedSlots).fill("planned" as AuditCourseStatus),
          ...wildcardStatuses,
        ].sort((a, b) => rank(a) - rank(b));

        const requiredSlots = Math.max(baseEval.requiredSlots, section.requirementType === "choose" ? section.chooseCount ?? 1 : slotStatuses.length);
        const relevant = slotStatuses.slice(0, requiredSlots);

        const completedSlots = relevant.filter((status) => status === "completed").length;
        const inProgressSlots = relevant.filter((status) => status === "in_progress").length;
        const plannedSlots = relevant.filter((status) => status === "planned").length;

        let status: AuditCourseStatus = "not_started";
        if (completedSlots >= requiredSlots) status = "completed";
        else if (completedSlots + inProgressSlots >= requiredSlots) status = "in_progress";
        else if (completedSlots + inProgressSlots + plannedSlots >= requiredSlots) status = "planned";

        return {
          section,
          wildcardSlots,
          eval: {
            sectionId: section.id,
            status,
            requiredSlots,
            completedSlots,
            inProgressSlots,
            plannedSlots,
          },
        };
      });

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
  }, [bundles, byCourseCode, courses, wildcardSelections]);

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
                  <p className="text-3xl text-foreground">{summary.totalCredits} / {summary.requiredCredits}</p>
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

              <div className="mt-6 rounded-lg border border-border bg-input-background p-4">
                <p className="text-sm text-muted-foreground mb-3">Credits Progress</p>
                <div className="h-4 w-full rounded bg-muted overflow-hidden border border-border/60 flex">
                  {(() => {
                    const total = Math.max(1, summary.requiredCredits);
                    const completedPct = Math.min(100, (summary.completedCredits / total) * 100);
                    const inProgressPct = Math.min(Math.max(0, 100 - completedPct), (summary.inProgressCredits / total) * 100);
                    const plannedPct = Math.min(Math.max(0, 100 - completedPct - inProgressPct), (summary.plannedCredits / total) * 100);
                    return (
                      <>
                        <div className="h-full bg-green-500" style={{ width: `${completedPct}%` }} />
                        <div className="h-full bg-blue-500" style={{ width: `${inProgressPct}%` }} />
                        <div className="h-full bg-amber-500" style={{ width: `${plannedPct}%` }} />
                      </>
                    );
                  })()}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Required credits: {summary.requiredCredits} ({summary.requiredCredits === 150 ? "Dual degree" : "Standard degree"})
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-green-100 text-green-900 border border-green-300 dark:bg-green-600/20 dark:text-green-300 dark:border-green-600/40">Complete: {summary.completedCredits} cr</Badge>
                  <Badge className="bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-600/40">In Progress: {summary.inProgressCredits} cr</Badge>
                  <Badge className="bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-600/40">Planned: {summary.plannedCredits} cr</Badge>
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
                    <Badge variant="outline" className="border-border text-foreground/80">
                      {sectionEditSyncState === "saving" && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                      {sectionEditSyncState === "synced" && <Cloud className="w-3.5 h-3.5 mr-1" />}
                      {sectionEditSyncState === "local" && <CloudOff className="w-3.5 h-3.5 mr-1" />}
                      {sectionEditSyncState === "saving" && "Saving edits..."}
                      {sectionEditSyncState === "synced" && "Edits synced to cloud"}
                      {sectionEditSyncState === "local" && "Edits saved locally"}
                      {sectionEditSyncState === "idle" && "Section edits ready"}
                    </Badge>
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
                            <h2
                              className={`text-2xl ${
                                programAudit.requiredSlots > 0 && programAudit.completedSlots >= programAudit.requiredSlots
                                  ? "text-green-500"
                                  : (programAudit.completedSlots > 0 || programAudit.inProgressSlots > 0)
                                    ? "text-blue-500"
                                    : "text-foreground"
                              }`}
                            >
                              {programAudit.bundle.programName}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              {programAudit.bundle.kind.toUpperCase()} - {programAudit.bundle.source === "db" ? "custom saved rules" : "catalog scraped rules"}
                              {(() => {
                                const catalogUrl = getCatalogRequirementsUrl(programAudit.bundle);
                                if (!catalogUrl) return null;
                                return (
                                  <>
                                    {" "}
                                    <a
                                      href={catalogUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-red-500 hover:text-red-600 underline"
                                    >
                                      If info is not correct, go here and edit it.
                                    </a>
                                  </>
                                );
                              })()}
                            </p>
                          </div>
                          {statusBadge(programAudit.status)}
                        </div>

                        <div className="flex items-center gap-4 mb-5">
                          <Progress value={programAudit.progressPercent} className="flex-1 h-3" />
                          <span className="text-foreground text-sm">
                            {Math.min(programAudit.requiredSlots, programAudit.completedSlots + programAudit.inProgressSlots)} / {programAudit.requiredSlots} required classes
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

                        <div className="mb-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border text-foreground/80"
                            onClick={() => startAddingSection(index)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Section
                          </Button>
                        </div>

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
                                {baseSections.map(({ section, eval: sectionEval, wildcardSlots }) => {
                                  const editingThisSection = editingProgramIndex === index && editingSectionId === section.id && sectionDraft;
                                  if (editingThisSection) {
                                    return (
                                      <Card key={section.id} ref={editorCardRef} className="bg-input-background border-border p-4">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                          <h4 className="text-foreground">Edit Section</h4>
                                          <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                          <Input
                                            value={sectionDraft.title}
                                            onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                            placeholder="Title: section name"
                                          />
                                          <select
                                            className="h-9 rounded-md border border-input bg-input-background px-3 text-sm"
                                            value={sectionDraft.requirementType}
                                            onChange={(event) => setSectionDraft((prev) => prev ? {
                                              ...prev,
                                              requirementType: event.target.value === "choose" ? "choose" : "all",
                                            } : prev)}
                                          >
                                            <option value="all">All Required</option>
                                            <option value="choose">Choose N</option>
                                          </select>
                                          <Input
                                            type="number"
                                            min={1}
                                            value={sectionDraft.chooseCount ?? 1}
                                            onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                            placeholder="Section type count"
                                            disabled={sectionDraft.requirementType !== "choose"}
                                          />
                                        </div>

                                        <Textarea
                                          value={sectionDraft.notesText}
                                          onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                          placeholder="Notes: one per line"
                                          className="mb-3"
                                        />

                                        <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                        <div className="space-y-2 mb-3">
                                          {sectionDraft.blocks.map((block) => (
                                            <div key={block.id} className={`p-3 border rounded-md ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"}`}>
                                              <div className="flex items-center gap-2 mb-2">
                                                <select
                                                  className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                                  value={block.type}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: prev.blocks.map((item) => item.id === block.id ? {
                                                      ...item,
                                                      type: event.target.value === "OR" ? "OR" : "AND",
                                                    } : item),
                                                  } : prev)}
                                                >
                                                  <option value="AND">AND</option>
                                                  <option value="OR">OR</option>
                                                </select>
                                                <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: prev.blocks.filter((item) => item.id !== block.id),
                                                  } : prev)}
                                                >
                                                  Remove
                                                </Button>
                                              </div>
                                              <div className="flex flex-wrap gap-2">
                                                {block.codes.map((code) => (
                                                  <Badge key={`${block.id}-${code}`} variant="outline" className="border-border text-foreground/80">
                                                    {code}
                                                    <button
                                                      type="button"
                                                      className="ml-2"
                                                      onClick={() => setSectionDraft((prev) => prev ? {
                                                        ...prev,
                                                        blocks: prev.blocks.map((item) => item.id === block.id
                                                          ? { ...item, codes: item.codes.filter((value) => value !== code) }
                                                          : item),
                                                      } : prev)}
                                                    >
                                                      x
                                                    </button>
                                                  </Badge>
                                                ))}
                                                {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-3">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const blockId = createLocalId("block");
                                              setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                              } : prev);
                                              setActiveDraftBlockId(blockId);
                                            }}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const blockId = createLocalId("block");
                                              setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                              } : prev);
                                              setActiveDraftBlockId(blockId);
                                            }}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                          </Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                          <Input
                                            value={courseSearchQuery}
                                            onChange={(event) => setCourseSearchQuery(event.target.value)}
                                            placeholder="Search courses (e.g. BSCI330 or genetics)"
                                          />
                                          <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending}>
                                            {courseSearchPending ? "Searching..." : "Search"}
                                          </Button>
                                        </div>

                                        {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                        {courseSearchResults.length > 0 && (
                                          <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                            {courseSearchResults.map((course) => (
                                              <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                                <div>
                                                  <p className="text-sm text-foreground">{course.code}</p>
                                                  <p className="text-xs text-muted-foreground">{course.title}</p>
                                                </div>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    if (!activeDraftBlockId) return;
                                                    setSectionDraft((prev) => prev ? {
                                                      ...prev,
                                                      blocks: prev.blocks.map((block) => block.id === activeDraftBlockId
                                                        ? { ...block, codes: Array.from(new Set([...block.codes, course.code])) }
                                                        : block),
                                                    } : prev);
                                                  }}
                                                >
                                                  Add to Block
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        <div className="flex gap-2 justify-end">
                                          <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="border-red-600/40 text-red-400"
                                            onClick={() => {
                                              const nextSections = programAudit.bundle.sections.filter((item) => item.id !== editingSectionId);
                                              persistProgramSections(programAudit.bundle.programId, nextSections);
                                              resetDraftEditor();
                                            }}
                                          >
                                            Delete Section
                                          </Button>
                                          <Button
                                            type="button"
                                            className="bg-red-600 hover:bg-red-700"
                                            onClick={() => {
                                              if (!sectionDraft) return;
                                              const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                              const nextSections = programAudit.bundle.sections.map((item) => item.id === editingSectionId ? {
                                                ...updatedSection,
                                                specializationId: item.specializationId,
                                              } : item);
                                              persistProgramSections(programAudit.bundle.programId, nextSections);
                                              resetDraftEditor();
                                            }}
                                          >
                                            <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                          </Button>
                                        </div>
                                      </Card>
                                    );
                                  }

                                  return (
                                    <RequirementSectionCard
                                      key={section.id}
                                      section={section}
                                      sectionEval={sectionEval}
                                      wildcardSlots={wildcardSlots}
                                      onSelectWildcardCourse={(slotKey, courseCode) => {
                                        setWildcardSelections((prev) => ({
                                          ...prev,
                                          [slotKey]: courseCode,
                                        }));
                                      }}
                                      allCourses={courses}
                                      courseDetails={courseDetails}
                                      byCourseCode={byCourseCode}
                                      expandedSectionIds={expandedSectionIds}
                                      setExpandedSectionIds={setExpandedSectionIds}
                                      onEdit={() => startEditingSection(index, section)}
                                    />
                                  );
                                })}

                                {editingProgramIndex === index && sectionDraft && editingSectionId === null && (
                                  <Card ref={editorCardRef} className="bg-input-background border-border p-4">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <h4 className="text-foreground">Add Section</h4>
                                      <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>

                                    <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                      <Input
                                        value={sectionDraft.title}
                                        onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                        placeholder="Title: section name"
                                      />
                                      <select
                                        className="h-9 rounded-md border border-input bg-input-background px-3 text-sm"
                                        value={sectionDraft.requirementType}
                                        onChange={(event) => setSectionDraft((prev) => prev ? {
                                          ...prev,
                                          requirementType: event.target.value === "choose" ? "choose" : "all",
                                        } : prev)}
                                      >
                                        <option value="all">All Required</option>
                                        <option value="choose">Choose N</option>
                                      </select>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={sectionDraft.chooseCount ?? 1}
                                        onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                        placeholder="Section type count"
                                        disabled={sectionDraft.requirementType !== "choose"}
                                      />
                                    </div>

                                    <Textarea
                                      value={sectionDraft.notesText}
                                      onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                      placeholder="Notes: one per line"
                                      className="mb-3"
                                    />

                                    <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                        <div className="space-y-2 mb-3">
                                      {sectionDraft.blocks.map((block) => (
                                        <div key={block.id} className={`p-3 border rounded-md ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"}`}>
                                          <div className="flex items-center gap-2 mb-2">
                                            <select
                                              className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                              value={block.type}
                                              onChange={(event) => setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: prev.blocks.map((item) => item.id === block.id ? {
                                                  ...item,
                                                  type: event.target.value === "OR" ? "OR" : "AND",
                                                } : item),
                                              } : prev)}
                                            >
                                              <option value="AND">AND</option>
                                              <option value="OR">OR</option>
                                            </select>
                                            <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: prev.blocks.filter((item) => item.id !== block.id),
                                              } : prev)}
                                            >
                                              Remove
                                            </Button>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            {block.codes.map((code) => (
                                              <Badge key={`${block.id}-${code}`} variant="outline" className="border-border text-foreground/80">
                                                {code}
                                                <button
                                                  type="button"
                                                  className="ml-2"
                                                  onClick={() => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: prev.blocks.map((item) => item.id === block.id
                                                      ? { ...item, codes: item.codes.filter((value) => value !== code) }
                                                      : item),
                                                  } : prev)}
                                                >
                                                  x
                                                </button>
                                              </Badge>
                                            ))}
                                            {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mb-3">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const blockId = createLocalId("block");
                                          setSectionDraft((prev) => prev ? {
                                            ...prev,
                                            blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                          } : prev);
                                          setActiveDraftBlockId(blockId);
                                        }}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const blockId = createLocalId("block");
                                          setSectionDraft((prev) => prev ? {
                                            ...prev,
                                            blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                          } : prev);
                                          setActiveDraftBlockId(blockId);
                                        }}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                      </Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                      <Input
                                        value={courseSearchQuery}
                                        onChange={(event) => setCourseSearchQuery(event.target.value)}
                                        placeholder="Search courses (e.g. BSCI330 or genetics)"
                                      />
                                      <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending}>
                                        {courseSearchPending ? "Searching..." : "Search"}
                                      </Button>
                                    </div>

                                    {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                    {courseSearchResults.length > 0 && (
                                      <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                        {courseSearchResults.map((course) => (
                                          <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                            <div>
                                              <p className="text-sm text-foreground">{course.code}</p>
                                              <p className="text-xs text-muted-foreground">{course.title}</p>
                                            </div>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                if (!activeDraftBlockId) return;
                                                setSectionDraft((prev) => prev ? {
                                                  ...prev,
                                                  blocks: prev.blocks.map((block) => block.id === activeDraftBlockId
                                                    ? { ...block, codes: Array.from(new Set([...block.codes, course.code])) }
                                                    : block),
                                                } : prev);
                                              }}
                                            >
                                              Add to Block
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div className="flex gap-2 justify-end">
                                      <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                      <Button
                                        type="button"
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={() => {
                                          if (!sectionDraft) return;
                                          const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                          let nextSections = programAudit.bundle.sections;
                                          nextSections = [...nextSections, updatedSection];
                                          persistProgramSections(programAudit.bundle.programId, nextSections);
                                          resetDraftEditor();
                                        }}
                                      >
                                        <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                      </Button>
                                    </div>
                                  </Card>
                                )}

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
                                      {specializationSections.map(({ section, eval: sectionEval, wildcardSlots }) => {
                                        const editingThisSection = editingProgramIndex === index && editingSectionId === section.id && sectionDraft;
                                        if (editingThisSection) {
                                          return (
                                            <Card key={section.id} ref={editorCardRef} className="bg-input-background border-border p-4">
                                              <div className="flex items-center justify-between gap-2 mb-3">
                                                <h4 className="text-foreground">Edit Section</h4>
                                                <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </div>

                                              <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                                <Input
                                                  value={sectionDraft.title}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                                  placeholder="Title: section name"
                                                />
                                                <select
                                                  className="h-9 rounded-md border border-input bg-input-background px-3 text-sm"
                                                  value={sectionDraft.requirementType}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    requirementType: event.target.value === "choose" ? "choose" : "all",
                                                  } : prev)}
                                                >
                                                  <option value="all">All Required</option>
                                                  <option value="choose">Choose N</option>
                                                </select>
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  value={sectionDraft.chooseCount ?? 1}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                                  placeholder="Section type count"
                                                  disabled={sectionDraft.requirementType !== "choose"}
                                                />
                                              </div>

                                              <Textarea
                                                value={sectionDraft.notesText}
                                                onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                                placeholder="Notes: one per line"
                                                className="mb-3"
                                              />

                                              <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                        <div className="space-y-2 mb-3">
                                                {sectionDraft.blocks.map((block) => (
                                                  <div key={block.id} className={`p-3 border rounded-md ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"}`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <select
                                                        className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                                        value={block.type}
                                                        onChange={(event) => setSectionDraft((prev) => prev ? {
                                                          ...prev,
                                                          blocks: prev.blocks.map((item) => item.id === block.id ? {
                                                            ...item,
                                                            type: event.target.value === "OR" ? "OR" : "AND",
                                                          } : item),
                                                        } : prev)}
                                                      >
                                                        <option value="AND">AND</option>
                                                        <option value="OR">OR</option>
                                                      </select>
                                                      <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setSectionDraft((prev) => prev ? {
                                                          ...prev,
                                                          blocks: prev.blocks.filter((item) => item.id !== block.id),
                                                        } : prev)}
                                                      >
                                                        Remove
                                                      </Button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                      {block.codes.map((code) => (
                                                        <Badge key={`${block.id}-${code}`} variant="outline" className="border-border text-foreground/80">
                                                          {code}
                                                          <button
                                                            type="button"
                                                            className="ml-2"
                                                            onClick={() => setSectionDraft((prev) => prev ? {
                                                              ...prev,
                                                              blocks: prev.blocks.map((item) => item.id === block.id
                                                                ? { ...item, codes: item.codes.filter((value) => value !== code) }
                                                                : item),
                                                            } : prev)}
                                                          >
                                                            x
                                                          </button>
                                                        </Badge>
                                                      ))}
                                                      {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>

                                              <div className="flex flex-wrap gap-2 mb-3">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    const blockId = createLocalId("block");
                                                    setSectionDraft((prev) => prev ? {
                                                      ...prev,
                                                      blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                                    } : prev);
                                                    setActiveDraftBlockId(blockId);
                                                  }}
                                                >
                                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    const blockId = createLocalId("block");
                                                    setSectionDraft((prev) => prev ? {
                                                      ...prev,
                                                      blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                                    } : prev);
                                                    setActiveDraftBlockId(blockId);
                                                  }}
                                                >
                                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                                </Button>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                                <Input
                                                  value={courseSearchQuery}
                                                  onChange={(event) => setCourseSearchQuery(event.target.value)}
                                                  placeholder="Search courses (e.g. BSCI330 or genetics)"
                                                />
                                                <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending}>
                                                  {courseSearchPending ? "Searching..." : "Search"}
                                                </Button>
                                              </div>

                                              {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                              {courseSearchResults.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                                  {courseSearchResults.map((course) => (
                                                    <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                                      <div>
                                                        <p className="text-sm text-foreground">{course.code}</p>
                                                        <p className="text-xs text-muted-foreground">{course.title}</p>
                                                      </div>
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                          if (!activeDraftBlockId) return;
                                                          setSectionDraft((prev) => prev ? {
                                                            ...prev,
                                                            blocks: prev.blocks.map((block) => block.id === activeDraftBlockId
                                                              ? { ...block, codes: Array.from(new Set([...block.codes, course.code])) }
                                                              : block),
                                                          } : prev);
                                                        }}
                                                      >
                                                        Add to Block
                                                      </Button>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              <div className="flex gap-2 justify-end">
                                                <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="border-red-600/40 text-red-400"
                                                  onClick={() => {
                                                    const nextSections = programAudit.bundle.sections.filter((item) => item.id !== editingSectionId);
                                                    persistProgramSections(programAudit.bundle.programId, nextSections);
                                                    resetDraftEditor();
                                                  }}
                                                >
                                                  Delete Section
                                                </Button>
                                                <Button
                                                  type="button"
                                                  className="bg-red-600 hover:bg-red-700"
                                                  onClick={() => {
                                                    if (!sectionDraft) return;
                                                    const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                                    const nextSections = programAudit.bundle.sections.map((item) => item.id === editingSectionId ? {
                                                      ...updatedSection,
                                                      specializationId: item.specializationId,
                                                    } : item);
                                                    persistProgramSections(programAudit.bundle.programId, nextSections);
                                                    resetDraftEditor();
                                                  }}
                                                >
                                                  <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                                </Button>
                                              </div>
                                            </Card>
                                          );
                                        }

                                        return (
                                          <RequirementSectionCard
                                            key={section.id}
                                            section={section}
                                            sectionEval={sectionEval}
                                            wildcardSlots={wildcardSlots}
                                            onSelectWildcardCourse={(slotKey, courseCode) => {
                                              setWildcardSelections((prev) => ({
                                                ...prev,
                                                [slotKey]: courseCode,
                                              }));
                                            }}
                                            allCourses={courses}
                                            courseDetails={courseDetails}
                                            byCourseCode={byCourseCode}
                                            expandedSectionIds={expandedSectionIds}
                                            setExpandedSectionIds={setExpandedSectionIds}
                                            onEdit={() => startEditingSection(index, section)}
                                          />
                                        );
                                      })}
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
