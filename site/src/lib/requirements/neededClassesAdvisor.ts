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
