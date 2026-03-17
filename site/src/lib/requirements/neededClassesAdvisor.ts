import type { AuditCourseStatus, ProgramRequirementBundle } from "@/lib/requirements/audit";
import type { CourseDetails } from "@/lib/requirements/courseDetailsLoader";

export type NeededItemKind = "course" | "gened" | "elective";
export type NeededItemCategory = "major_minor" | "gened" | "elective";

export interface NeededClassItem {
  id: string;
  kind: NeededItemKind;
  category: NeededItemCategory;
  title: string;
  courseCode?: string;
  programLabel?: string;
  genEdCode?: string;
  status: AuditCourseStatus;
  credits: number;
  sortableProgram: string;
  recommendedTermLabel?: string;
  recommendationScore: number;
  rationale: string[];
  prereqCodes: string[];
  draggable: boolean;
}

export interface RecommendationTimelineTerm {
  id: string;
  label: string;
}

export interface RecommendedTermPlan {
  termId: string;
  termLabel: string;
  courseCodes: string[];
  credits: number;
  targetCredits: number;
}

export interface GraduationFitCheck {
  isFeasible: boolean;
  neededCredits: number;
  capacityCredits: number;
  termsRemaining: number;
  message: string;
}

export interface RecommendationPlanResult {
  assignments: RecommendedTermPlan[];
  fitCheck: GraduationFitCheck;
}

export const GEN_ED_REQUIRED: Record<string, number> = {
  FSAR: 1,
  FSAW: 1,
  FSMA: 1,
  FSOC: 1,
  FSPW: 1,
  DSHS: 2,
  DSHU: 2,
  DSNL: 1,
  DSNS: 1,
  DSSP: 2,
  SCIS: 1,
  DVUP: 2,
  DVCC: 1,
};

export const GEN_ED_TITLE: Record<string, string> = {
  FSAR: "Analytic Reasoning",
  FSAW: "Academic Writing",
  FSMA: "Mathematics",
  FSOC: "Oral Communication",
  FSPW: "Professional Writing",
  DSHS: "History & Social Sciences",
  DSHU: "Humanities",
  DSNL: "Natural Sciences with Lab",
  DSNS: "Natural Sciences",
  DSSP: "Scholarship in Practice",
  SCIS: "I-Series",
  DVUP: "Diversity - Understanding Plural Societies",
  DVCC: "Diversity - Cultural Competence",
};

export function parseCourseCodesFromText(text: string | undefined): string[] {
  const matches = String(text ?? "").toUpperCase().match(/[A-Z]{4}\d{3}[A-Z]?/g);
  return Array.from(new Set(matches ?? []));
}

function courseLevel(code: string): number {
  const match = String(code).match(/^[A-Z]{4}(\d{3})/);
  return match ? Number(match[1]) : 100;
}

function statusRank(status: AuditCourseStatus): number {
  if (status === "completed") return 4;
  if (status === "in_progress") return 3;
  if (status === "planned") return 2;
  return 1;
}

export function buildNeededClassItems(params: {
  bundles: ProgramRequirementBundle[];
  byCourseCode: Map<string, AuditCourseStatus>;
  byCourseTags: Map<string, string[]>;
  courseDetails?: Map<string, CourseDetails>;
  totalPlannedCredits?: number;
  timelineTermLabels?: string[];
  targetTermLabel?: string;
}): NeededClassItem[] {
  const {
    bundles,
    byCourseCode,
    byCourseTags,
    courseDetails,
    totalPlannedCredits = 0,
    timelineTermLabels = [],
    targetTermLabel,
  } = params;

  const items: NeededClassItem[] = [];
  const seenCourseCodes = new Set<string>();

  for (const bundle of bundles) {
    const programLabel = `${bundle.kind.toUpperCase()}: ${bundle.programName}`;
    for (const section of bundle.sections) {
      for (const rawCode of section.courseCodes ?? []) {
        const code = String(rawCode).toUpperCase();
        if (!code || seenCourseCodes.has(code)) continue;
        seenCourseCodes.add(code);

        const status = byCourseCode.get(code) ?? "not_started";
        if (status === "completed") continue;

        const details = courseDetails?.get(code);
        const prereqCodes = parseCourseCodesFromText(details?.prereqs);
        const unmetPrereqs = prereqCodes.filter((prereq) => (byCourseCode.get(prereq) ?? "not_started") === "not_started");
        const level = courseLevel(code);

        const rationale: string[] = [];
        if (status === "in_progress") rationale.push("Already in progress this term.");
        if (status === "planned") rationale.push("Already planned in a future term.");
        if (unmetPrereqs.length > 0) rationale.push(`Prerequisites still needed: ${unmetPrereqs.join(", ")}.`);
        else if (prereqCodes.length > 0) rationale.push("Prerequisites appear satisfied.");
        if (level >= 400) rationale.push("Upper-level course, usually better after core classes.");
        else if (level >= 300) rationale.push("Mid-level major course; consider after gateway classes.");
        else rationale.push("Lower-level course that can be taken earlier.");

        let recommendationScore = 100;
        recommendationScore -= unmetPrereqs.length * 25;
        recommendationScore -= level >= 400 ? 20 : level >= 300 ? 10 : 0;
        recommendationScore -= status === "planned" ? 25 : status === "in_progress" ? 40 : 0;
        recommendationScore += bundle.kind === "major" ? 10 : 4;

        const recommendedTermLabel = timelineTermLabels.length > 0
          ? timelineTermLabels[Math.min(timelineTermLabels.length - 1, Math.max(0, unmetPrereqs.length + (level >= 300 ? 1 : 0)))]
          : undefined;

        if (targetTermLabel && recommendedTermLabel) {
          const targetIndex = timelineTermLabels.indexOf(targetTermLabel);
          const recommendedIndex = timelineTermLabels.indexOf(recommendedTermLabel);
          if (targetIndex >= 0 && recommendedIndex >= 0) {
            recommendationScore -= Math.abs(targetIndex - recommendedIndex) * 8;
          }
        }

        items.push({
          id: `course-${code}`,
          kind: "course",
          category: "major_minor",
          title: details?.title ?? code,
          courseCode: code,
          programLabel,
          status,
          credits: Number(details?.credits ?? 0) || 3,
          sortableProgram: `${bundle.kind}-${bundle.programName}`.toLowerCase(),
          recommendedTermLabel,
          recommendationScore,
          rationale,
          prereqCodes,
          draggable: true,
        });
      }
    }
  }

  const earnedGenEdCount = new Map<string, number>();
  for (const [code, tags] of byCourseTags.entries()) {
    const status = byCourseCode.get(code) ?? "not_started";
    if (status === "not_started") continue;
    for (const rawTag of tags ?? []) {
      const tag = String(rawTag).toUpperCase();
      if (!GEN_ED_REQUIRED[tag]) continue;
      earnedGenEdCount.set(tag, (earnedGenEdCount.get(tag) ?? 0) + 1);
    }
  }

  for (const [genEdCode, required] of Object.entries(GEN_ED_REQUIRED)) {
    const have = earnedGenEdCount.get(genEdCode) ?? 0;
    const remaining = Math.max(0, required - have);
    for (let i = 0; i < remaining; i += 1) {
      items.push({
        id: `gened-${genEdCode}-${i}`,
        kind: "gened",
        category: "gened",
        title: `${genEdCode} - ${GEN_ED_TITLE[genEdCode] ?? "Gen Ed"}`,
        genEdCode,
        status: "not_started",
        credits: 3,
        sortableProgram: "zz-gened",
        recommendedTermLabel: timelineTermLabels[Math.min(timelineTermLabels.length - 1, i)] ?? undefined,
        recommendationScore: 65 - i,
        rationale: [
          `${genEdCode} is still required for graduation.`,
          "Use the Apply Filter button to find matching classes this term.",
        ],
        prereqCodes: [],
        draggable: false,
      });
    }
  }

  const remainingCreditGap = Math.max(0, 120 - totalPlannedCredits);
  const electiveSlots = Math.min(4, Math.ceil(remainingCreditGap / 3));
  for (let i = 0; i < electiveSlots; i += 1) {
    items.push({
      id: `elective-${i}`,
      kind: "elective",
      category: "elective",
      title: "Advisor Elective Slot",
      status: "not_started",
      credits: 3,
      sortableProgram: "zzz-elective",
      recommendedTermLabel: timelineTermLabels[Math.min(timelineTermLabels.length - 1, Math.max(0, i + 1))] ?? undefined,
      recommendationScore: 35 - i,
      rationale: [
        "You likely need additional credits to reach graduation totals.",
        "Choose electives that support your interests, minor, or career goals.",
      ],
      prereqCodes: [],
      draggable: false,
    });
  }

  return items;
}

function recommendationPriority(item: NeededClassItem): number {
  const level = courseLevel(item.courseCode ?? "");
  let score = 100;
  if (item.category === "major_minor") score += 20;
  if (item.programLabel?.startsWith("MAJOR:")) score += 15;
  score -= item.prereqCodes.length * 12;
  score -= level >= 400 ? 22 : level >= 300 ? 12 : 0;
  score -= item.status === "planned" ? 10 : item.status === "in_progress" ? 22 : 0;
  return score;
}

export function generateRecommendationPlan(params: {
  items: NeededClassItem[];
  timeline: RecommendationTimelineTerm[];
  minCreditsPerTerm?: number;
  maxCreditsPerTerm?: number;
}): RecommendationPlanResult {
  const { items, timeline, minCreditsPerTerm = 12, maxCreditsPerTerm = 16 } = params;
  const scheduleTerms = timeline.length > 0 ? timeline : [];

  const courseItems = items
    .filter((item) => item.kind === "course" && item.courseCode)
    .map((item) => ({ ...item, courseCode: item.courseCode! }));

  const others = items.filter((item) => item.kind !== "course");

  const totalNeededCredits = items.reduce((sum, item) => sum + Math.max(0, Number(item.credits) || 0), 0);
  const remainingTerms = Math.max(1, scheduleTerms.length);
  const balanced = Math.ceil(totalNeededCredits / remainingTerms);
  const targetCredits = Math.max(minCreditsPerTerm, Math.min(maxCreditsPerTerm, balanced));
  const hardCapacityPerTerm = maxCreditsPerTerm + 2;

  const byCode = new Map(courseItems.map((item) => [item.courseCode, item]));
  const internalPrereqs = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const item of courseItems) {
    const prereqs = item.prereqCodes.filter((code) => byCode.has(code));
    internalPrereqs.set(item.courseCode, prereqs);
    indegree.set(item.courseCode, prereqs.length);
    for (const prereq of prereqs) {
      dependents.set(prereq, [...(dependents.get(prereq) ?? []), item.courseCode]);
    }
  }

  const unassigned = new Set(courseItems.map((item) => item.courseCode));
  const assignedByTerm = new Map<string, string[]>();

  const getReadyCourses = () => {
    return Array.from(unassigned)
      .filter((code) => (indegree.get(code) ?? 0) === 0)
      .sort((left, right) => recommendationPriority(byCode.get(right)!) - recommendationPriority(byCode.get(left)!));
  };

  for (const term of scheduleTerms) {
    let used = 0;
    let ready = getReadyCourses();
    while (ready.length > 0) {
      const nextCode = ready[0];
      const nextItem = byCode.get(nextCode)!;
      const nextCredits = Math.max(1, Number(nextItem.credits) || 3);
      if (used + nextCredits > hardCapacityPerTerm) break;

      assignedByTerm.set(term.id, [...(assignedByTerm.get(term.id) ?? []), nextCode]);
      used += nextCredits;
      unassigned.delete(nextCode);

      for (const dependent of dependents.get(nextCode) ?? []) {
        indegree.set(dependent, Math.max(0, (indegree.get(dependent) ?? 0) - 1));
      }

      if (used >= targetCredits) break;
      ready = getReadyCourses();
    }
  }

  // If graph/capacity left courses unassigned, place them in least-loaded terms as fallback.
  for (const code of Array.from(unassigned)) {
    const course = byCode.get(code);
    if (!course || scheduleTerms.length === 0) continue;
    const credits = Math.max(1, Number(course.credits) || 3);

    let chosen: RecommendationTimelineTerm | null = null;
    let lowestLoad = Number.POSITIVE_INFINITY;
    for (const term of scheduleTerms) {
      const currentLoad = (assignedByTerm.get(term.id) ?? [])
        .map((courseCode) => Math.max(1, Number(byCode.get(courseCode)?.credits ?? 3)))
        .reduce((sum, value) => sum + value, 0);
      if (currentLoad < lowestLoad) {
        lowestLoad = currentLoad;
        chosen = term;
      }
    }

    if (!chosen) continue;
    if (lowestLoad + credits > hardCapacityPerTerm + 3) continue;
    assignedByTerm.set(chosen.id, [...(assignedByTerm.get(chosen.id) ?? []), code]);
    unassigned.delete(code);
  }

  // Spread non-course requirement placeholders across lightest terms.
  const placeholderCreditsByTerm = new Map<string, number>();
  for (const placeholder of others) {
    if (scheduleTerms.length === 0) break;
    let chosen: RecommendationTimelineTerm | null = null;
    let load = Number.POSITIVE_INFINITY;
    for (const term of scheduleTerms) {
      const courseLoad = (assignedByTerm.get(term.id) ?? [])
        .map((courseCode) => Math.max(1, Number(byCode.get(courseCode)?.credits ?? 3)))
        .reduce((sum, value) => sum + value, 0);
      const placeholderLoad = placeholderCreditsByTerm.get(term.id) ?? 0;
      if (courseLoad + placeholderLoad < load) {
        load = courseLoad + placeholderLoad;
        chosen = term;
      }
    }
    if (!chosen) continue;
    placeholderCreditsByTerm.set(chosen.id, (placeholderCreditsByTerm.get(chosen.id) ?? 0) + Math.max(0, Number(placeholder.credits) || 0));
  }

  const assignments: RecommendedTermPlan[] = scheduleTerms.map((term) => {
    const courseCodes = assignedByTerm.get(term.id) ?? [];
    const courseCredits = courseCodes
      .map((courseCode) => Math.max(1, Number(byCode.get(courseCode)?.credits ?? 3)))
      .reduce((sum, value) => sum + value, 0);
    const placeholderCredits = placeholderCreditsByTerm.get(term.id) ?? 0;
    return {
      termId: term.id,
      termLabel: term.label,
      courseCodes,
      credits: courseCredits + placeholderCredits,
      targetCredits,
    };
  });

  const neededCredits = Math.max(0, totalNeededCredits);
  const capacityCredits = remainingTerms * hardCapacityPerTerm;
  const feasibleByCredits = neededCredits <= capacityCredits;
  const feasibleByGraph = unassigned.size === 0;
  const isFeasible = feasibleByCredits && feasibleByGraph;

  const message = isFeasible
    ? `Plan fits ${neededCredits} needed credits across ${remainingTerms} remaining terms.`
    : !feasibleByCredits
      ? `Plan may not fit: ${neededCredits} needed credits exceeds approx capacity ${capacityCredits}.`
      : `Plan may not fit prerequisite sequencing: ${unassigned.size} course(s) could not be placed cleanly.`;

  return {
    assignments,
    fitCheck: {
      isFeasible,
      neededCredits,
      capacityCredits,
      termsRemaining: remainingTerms,
      message,
    },
  };
}
