import type { AuditCourseStatus, ProgramRequirementBundle } from "@/lib/requirements/audit";
import type { CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import type { StudentPreferences } from "@/lib/repositories/studentPreferencesRepository";
import { getInterestedDepartments } from "@/lib/repositories/studentPreferencesRepository";
import {
  canonicalCourseCode,
  getEquivalentCourseCodes,
  normalizeCourseCode,
} from "@/lib/requirements/courseCodeEquivalency";

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
  /** Breakdown of the multi-factor score for debugging / tooltips */
  scoreBreakdown?: {
    prs: number;
    rus: number;
    pfs: number;
    spis: number;
    bonus: number;
  };
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

// Fundamental studies codes — these should be taken early
const FUNDAMENTAL_STUDIES_CODES = new Set(["FSAR", "FSAW", "FSMA", "FSOC", "FSPW"]);

export function parseCourseCodesFromText(text: string | undefined): string[] {
  const matches = String(text ?? "").toUpperCase().match(/[A-Z]{4}\d{3}[A-Z]?/g);
  return Array.from(new Set((matches ?? []).map((code) => normalizeCourseCode(code)).filter(Boolean)));
}

function getStatusWithHonorsEquivalency(byCourseCode: Map<string, AuditCourseStatus>, code: string): AuditCourseStatus {
  for (const candidate of getEquivalentCourseCodes(code)) {
    const status = byCourseCode.get(candidate);
    if (status) return status;
  }
  return "not_started";
}

function resolveEquivalentCodeInMap<T>(map: Map<string, T>, code: string): string | null {
  const normalized = normalizeCourseCode(code);
  if (map.has(normalized)) return normalized;
  for (const candidate of getEquivalentCourseCodes(normalized)) {
    if (map.has(candidate)) return candidate;
  }
  return null;
}

function courseLevel(code: string): number {
  const match = String(code).match(/^[A-Z]{4}(\d{3})/);
  return match ? Number(match[1]) : 100;
}

function courseDept(code: string): string {
  const match = String(code).match(/^([A-Z]{4})/);
  return match ? match[1] : "";
}

function statusRank(status: AuditCourseStatus): number {
  if (status === "completed") return 4;
  if (status === "in_progress") return 3;
  if (status === "planned") return 2;
  return 1;
}

// ── Multi-Factor Scoring ──

/**
 * Prerequisite Readiness Score (0–40)
 * Measures how ready the student is to take this course based on prerequisite completion.
 */
function computePRS(params: {
  prereqCodes: string[];
  byCourseCode: Map<string, AuditCourseStatus>;
}): { score: number; unmetPrereqs: string[]; weakPrereqs: string[] } {
  const { prereqCodes, byCourseCode } = params;

  if (prereqCodes.length === 0) {
    return { score: 40, unmetPrereqs: [], weakPrereqs: [] };
  }

  const unmetPrereqs: string[] = [];
  const weakPrereqs: string[] = [];
  let satisfiedCount = 0;
  let inProgressCount = 0;

  for (const prereq of prereqCodes) {
    const status = getStatusWithHonorsEquivalency(byCourseCode, prereq);
    if (status === "completed") {
      satisfiedCount++;
    } else if (status === "in_progress") {
      inProgressCount++;
      weakPrereqs.push(prereq);
    } else if (status === "planned") {
      weakPrereqs.push(prereq);
    } else {
      unmetPrereqs.push(prereq);
    }
  }

  const total = prereqCodes.length;
  if (unmetPrereqs.length > 0) {
    // Some prereqs completely unmet
    const metRatio = (satisfiedCount + inProgressCount) / total;
    return { score: Math.round(metRatio * 9), unmetPrereqs, weakPrereqs };
  }

  if (inProgressCount > 0 || weakPrereqs.length > 0) {
    // All prereqs at least planned/in-progress
    const completedRatio = satisfiedCount / total;
    const baseScore = 25 + Math.round(completedRatio * 10);
    return { score: Math.min(35, baseScore), unmetPrereqs, weakPrereqs };
  }

  // All prereqs completed
  return { score: 40, unmetPrereqs, weakPrereqs };
}

/**
 * Requirement Urgency Score (0–40)
 * How important is it to take this course soon?
 */
function computeRUS(params: {
  category: NeededItemCategory;
  bundleKind: "major" | "minor" | "program";
  level: number;
  status: AuditCourseStatus;
  termsRemaining: number;
  isGateway: boolean;
  blocksCount: number;
  sectionRequirementType: "all" | "choose";
  genEdCode?: string;
  genEdRemaining?: number;
  genEdRequired?: number;
}): number {
  const {
    category,
    bundleKind,
    level,
    status,
    termsRemaining,
    isGateway,
    blocksCount,
    sectionRequirementType,
    genEdCode,
    genEdRemaining,
    genEdRequired,
  } = params;

  let score = 0;

  if (category === "major_minor") {
    // Base urgency from program kind
    score += bundleKind === "major" ? 18 : 12;

    // Gateway / early-sequence courses get urgency boost
    if (isGateway || level < 200) score += 8;
    else if (level < 300) score += 4;

    // Courses that block others are more urgent
    score += Math.min(10, blocksCount * 3);

    // "all" requirements (every course required) are more urgent than "choose N"
    if (sectionRequirementType === "all") score += 3;

    // Urgency increases as graduation approaches
    if (termsRemaining <= 2) score += 6;
    else if (termsRemaining <= 4) score += 3;

    // Upper-level courses near graduation get a boost instead of penalty
    if (level >= 400 && termsRemaining <= 3) score += 4;

    // Already planned/in-progress — lower urgency for new suggestions
    if (status === "planned") score -= 12;
    if (status === "in_progress") score -= 20;
  } else if (category === "gened") {
    const remaining = genEdRemaining ?? 1;
    const required = genEdRequired ?? 1;

    // Completely unmet categories are most urgent
    if (remaining === required) score += 22;
    else if (remaining > 0) score += 14;

    // Fundamental studies should be taken early
    if (genEdCode && FUNDAMENTAL_STUDIES_CODES.has(genEdCode)) {
      score += 10;
      if (termsRemaining > 4) score += 4; // Extra push if early in degree
    } else {
      score += 5;
    }

    if (termsRemaining <= 2) score += 6;
  } else {
    // Electives — low urgency
    score += 5;
    if (termsRemaining <= 2) score += 3;
  }

  return Math.max(0, Math.min(40, score));
}

/**
 * Plan Fit Score (0–20)
 * How well does this course fit the student's current plan and schedule?
 */
function computePFS(params: {
  status: AuditCourseStatus;
  level: number;
  credits: number;
  targetTermIndex: number;
  recommendedTermIndex: number;
  timelineLength: number;
  totalPlannedCredits: number;
}): number {
  const {
    status,
    level,
    credits,
    targetTermIndex,
    recommendedTermIndex,
    timelineLength,
    totalPlannedCredits,
  } = params;

  let score = 10; // baseline

  // Term alignment bonus/penalty
  if (timelineLength > 0 && targetTermIndex >= 0 && recommendedTermIndex >= 0) {
    const termDiff = Math.abs(targetTermIndex - recommendedTermIndex);
    score -= Math.min(8, termDiff * 3);
  }

  // Already in plan — good fit
  if (status === "planned" || status === "in_progress") score += 5;

  // Level appropriateness (soft signal)
  // Early in plan: prefer lower-level; late: prefer upper-level
  if (timelineLength > 0) {
    const progressRatio = targetTermIndex / Math.max(1, timelineLength - 1);
    if (level >= 400 && progressRatio < 0.3) score -= 4;
    if (level <= 200 && progressRatio > 0.7) score -= 2;
  }

  // Credit overload guard
  if (totalPlannedCredits > 0 && totalPlannedCredits + credits > 18) {
    score -= 3;
  }

  return Math.max(0, Math.min(20, score));
}

/**
 * Student Preference / Interest Score (0–10)
 * How well does this course match the student's stated preferences?
 */
function computeSPIS(params: {
  courseCode: string;
  genEdTags: string[];
  preferences: StudentPreferences | null;
}): number {
  const { courseCode, genEdTags, preferences } = params;

  if (!preferences) return 5; // neutral when no preferences set

  let score = 5; // baseline

  const dept = courseDept(courseCode);
  if (dept && preferences.interestAreas.length > 0) {
    const interestedDepts = getInterestedDepartments(preferences.interestAreas);
    if (interestedDepts.has(dept)) {
      score += 5; // strong match
    }
  }

  // Slight penalty for formats that don't match (future: when section data is available)
  // For now, interest alignment is the primary SPIS factor

  return Math.max(0, Math.min(10, score));
}

// ── Dependency graph helpers ──

/**
 * Build a reverse-dependency map: for each course code, how many other required courses
 * list it as a prerequisite? This measures how "blocking" a course is.
 */
function buildBlocksCountMap(
  allCourseCodes: string[],
  courseDetails: Map<string, CourseDetails>,
): Map<string, number> {
  const blocksCount = new Map<string, number>();
  const codeSet = new Set(allCourseCodes.map((c) => normalizeCourseCode(c)));

  for (const code of codeSet) {
    const details = courseDetails.get(code);
    if (!details?.prereqs) continue;
    const prereqs = parseCourseCodesFromText(details.prereqs);
    for (const prereq of prereqs) {
      const canonical = canonicalCourseCode(prereq);
      if (codeSet.has(prereq) || codeSet.has(canonical)) {
        const key = codeSet.has(prereq) ? prereq : canonical;
        blocksCount.set(key, (blocksCount.get(key) ?? 0) + 1);
      }
    }
  }

  return blocksCount;
}

// ── Main engine ──

export function buildNeededClassItems(params: {
  bundles: ProgramRequirementBundle[];
  byCourseCode: Map<string, AuditCourseStatus>;
  byCourseTags: Map<string, string[]>;
  courseDetails?: Map<string, CourseDetails>;
  totalPlannedCredits?: number;
  timelineTermLabels?: string[];
  targetTermLabel?: string;
  preferences?: StudentPreferences | null;
  termsUntilGraduation?: number;
}): NeededClassItem[] {
  const {
    bundles,
    byCourseCode,
    byCourseTags,
    courseDetails = new Map(),
    totalPlannedCredits = 0,
    timelineTermLabels = [],
    targetTermLabel,
    preferences = null,
    termsUntilGraduation = 6,
  } = params;

  const items: NeededClassItem[] = [];
  const seenCourseCodes = new Set<string>();

  // Collect all required course codes for dependency analysis
  const allRequiredCodes = bundles.flatMap((b) =>
    b.sections.flatMap((s) => (s.courseCodes ?? []).map(normalizeCourseCode).filter(Boolean)),
  );
  const blocksCountMap = buildBlocksCountMap(allRequiredCodes, courseDetails);

  // Compute gen-ed fulfillment state for double-dip detection
  const earnedGenEdCount = new Map<string, number>();
  for (const [code, tags] of byCourseTags.entries()) {
    const status = getStatusWithHonorsEquivalency(byCourseCode, code);
    if (status === "not_started") continue;
    for (const rawTag of tags ?? []) {
      const tag = String(rawTag).toUpperCase();
      if (!GEN_ED_REQUIRED[tag]) continue;
      earnedGenEdCount.set(tag, (earnedGenEdCount.get(tag) ?? 0) + 1);
    }
  }

  // Identify unmet gen-ed categories for double-dip detection
  const unmetGenEds = new Set<string>();
  for (const [genEdCode, required] of Object.entries(GEN_ED_REQUIRED)) {
    const have = earnedGenEdCount.get(genEdCode) ?? 0;
    if (have < required) unmetGenEds.add(genEdCode);
  }

  // Determine gateway courses (level < 200 or blocking 2+ courses)
  const gatewayCodes = new Set<string>();
  for (const code of allRequiredCodes) {
    const level = courseLevel(code);
    const blocks = blocksCountMap.get(code) ?? 0;
    if (level < 200 || blocks >= 2) gatewayCodes.add(normalizeCourseCode(code));
  }

  const targetTermIndex = targetTermLabel ? timelineTermLabels.indexOf(targetTermLabel) : -1;

  // ── Major / Minor courses ──

  for (const bundle of bundles) {
    const programLabel = `${bundle.kind.toUpperCase()}: ${bundle.programName}`;
    for (const section of bundle.sections) {
      for (const rawCode of section.courseCodes ?? []) {
        const code = normalizeCourseCode(rawCode);
        const canonicalCode = canonicalCourseCode(code);
        if (!code || seenCourseCodes.has(canonicalCode)) continue;
        seenCourseCodes.add(canonicalCode);

        const status = getStatusWithHonorsEquivalency(byCourseCode, code);
        if (status === "completed") continue;

        const details = courseDetails.get(code);
        const prereqCodes = parseCourseCodesFromText(details?.prereqs);
        const level = courseLevel(code);
        const credits = Number(details?.credits ?? 0) || 3;
        const genEdTags = details?.genEds ?? [];
        const blocksCount = blocksCountMap.get(code) ?? blocksCountMap.get(canonicalCode) ?? 0;

        // Compute multi-factor scores
        const prsResult = computePRS({ prereqCodes, byCourseCode });
        const rus = computeRUS({
          category: "major_minor",
          bundleKind: bundle.kind,
          level,
          status,
          termsRemaining: termsUntilGraduation,
          isGateway: gatewayCodes.has(code),
          blocksCount,
          sectionRequirementType: section.requirementType,
        });

        const recommendedTermIndex = Math.min(
          timelineTermLabels.length - 1,
          Math.max(0, prsResult.unmetPrereqs.length + (level >= 300 ? 1 : 0)),
        );
        const recommendedTermLabel = timelineTermLabels.length > 0
          ? timelineTermLabels[recommendedTermIndex]
          : undefined;

        const pfs = computePFS({
          status,
          level,
          credits,
          targetTermIndex,
          recommendedTermIndex,
          timelineLength: timelineTermLabels.length,
          totalPlannedCredits,
        });

        const spis = computeSPIS({
          courseCode: code,
          genEdTags,
          preferences,
        });

        // Bonus: double-dip with gen-ed
        let bonus = 0;
        const doubleDipTags = genEdTags.filter((tag) => unmetGenEds.has(tag.toUpperCase()));
        if (doubleDipTags.length > 0) bonus += 3;

        // Bonus: linchpin course (last few requirements or capstone-level)
        if (level >= 400 && section.requirementType === "all") bonus += 2;

        const totalScore = Math.min(110, prsResult.score + rus + pfs + spis + bonus);

        // Build rationale
        const rationale = buildCourseRationale({
          status,
          prsResult,
          level,
          bundle,
          blocksCount,
          doubleDipTags,
          prereqCodes,
          termsRemaining: termsUntilGraduation,
        });

        items.push({
          id: `course-${code}`,
          kind: "course",
          category: "major_minor",
          title: details?.title ?? code,
          courseCode: code,
          programLabel,
          status,
          credits,
          sortableProgram: `${bundle.kind}-${bundle.programName}`.toLowerCase(),
          recommendedTermLabel,
          recommendationScore: totalScore,
          rationale,
          prereqCodes,
          draggable: true,
          scoreBreakdown: { prs: prsResult.score, rus, pfs, spis, bonus },
        });
      }
    }
  }

  // ── Gen Ed Gaps ──

  for (const [genEdCode, required] of Object.entries(GEN_ED_REQUIRED)) {
    const have = earnedGenEdCount.get(genEdCode) ?? 0;
    const remaining = Math.max(0, required - have);

    for (let i = 0; i < remaining; i += 1) {
      const rus = computeRUS({
        category: "gened",
        bundleKind: "program",
        level: 100,
        status: "not_started",
        termsRemaining: termsUntilGraduation,
        isGateway: false,
        blocksCount: 0,
        sectionRequirementType: "all",
        genEdCode,
        genEdRemaining: remaining,
        genEdRequired: required,
      });

      // PRS is 40 for gen-ed placeholders (no specific prereqs)
      const prs = 40;
      const pfs = 10; // neutral
      const spis = 5; // neutral

      const totalScore = Math.min(110, prs + rus + pfs + spis);

      const rationale: string[] = [];
      if (remaining === required) {
        rationale.push(`${genEdCode} is completely unmet — you need ${required} course${required > 1 ? "s" : ""}.`);
      } else {
        rationale.push(`${genEdCode} is partially met — ${remaining} more course${remaining > 1 ? "s" : ""} needed.`);
      }

      if (FUNDAMENTAL_STUDIES_CODES.has(genEdCode)) {
        rationale.push("Fundamental study — best taken early in your degree.");
      }

      rationale.push("Use the filter to find courses that satisfy this requirement.");

      // Check for major courses that double-dip
      const doubleDipCourses = items.filter(
        (item) =>
          item.category === "major_minor" &&
          item.courseCode &&
          courseDetails.get(item.courseCode)?.genEds?.some(
            (tag) => tag.toUpperCase() === genEdCode,
          ),
      );

      if (doubleDipCourses.length > 0) {
        const codes = doubleDipCourses.slice(0, 3).map((item) => item.courseCode).join(", ");
        rationale.push(`Double-dip opportunity: ${codes} also satisfies this.`);
      }

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
        recommendationScore: totalScore,
        rationale,
        prereqCodes: [],
        draggable: false,
        scoreBreakdown: { prs, rus, pfs, spis, bonus: 0 },
      });
    }
  }

  // ── Electives ──

  const remainingCreditGap = Math.max(0, 120 - totalPlannedCredits);
  const electiveSlots = Math.min(4, Math.ceil(remainingCreditGap / 3));

  // Build interest-aware elective suggestions
  const interestedDepts = preferences ? getInterestedDepartments(preferences.interestAreas) : new Set<string>();

  for (let i = 0; i < electiveSlots; i += 1) {
    const rus = computeRUS({
      category: "elective",
      bundleKind: "program",
      level: 200,
      status: "not_started",
      termsRemaining: termsUntilGraduation,
      isGateway: false,
      blocksCount: 0,
      sectionRequirementType: "all",
    });

    const prs = 40; // no prereq barrier for placeholder
    const pfs = 10;
    const spis = preferences && preferences.interestAreas.length > 0 ? 7 : 5;

    const totalScore = Math.min(110, prs + rus + pfs + spis - i * 3);

    const rationale: string[] = [];
    rationale.push("You likely need additional credits to reach the 120-credit graduation requirement.");

    if (preferences && preferences.interestAreas.length > 0) {
      const areas = preferences.interestAreas.slice(0, 3).join(", ");
      rationale.push(`Consider courses in: ${areas}.`);
    } else {
      rationale.push("Choose electives that support your interests, minor, or career goals.");
    }

    if (interestedDepts.size > 0) {
      const deptList = Array.from(interestedDepts).slice(0, 5).join(", ");
      rationale.push(`Try browsing departments: ${deptList}.`);
    }

    items.push({
      id: `elective-${i}`,
      kind: "elective",
      category: "elective",
      title: "Advisor Elective Slot",
      status: "not_started",
      credits: 3,
      sortableProgram: "zzz-elective",
      recommendedTermLabel: timelineTermLabels[Math.min(timelineTermLabels.length - 1, Math.max(0, i + 1))] ?? undefined,
      recommendationScore: totalScore,
      rationale,
      prereqCodes: [],
      draggable: false,
      scoreBreakdown: { prs, rus, pfs, spis, bonus: 0 },
    });
  }

  return items;
}

// ── Rationale builder ──

function buildCourseRationale(params: {
  status: AuditCourseStatus;
  prsResult: { score: number; unmetPrereqs: string[]; weakPrereqs: string[] };
  level: number;
  bundle: ProgramRequirementBundle;
  blocksCount: number;
  doubleDipTags: string[];
  prereqCodes: string[];
  termsRemaining: number;
}): string[] {
  const { status, prsResult, level, bundle, blocksCount, doubleDipTags, prereqCodes, termsRemaining } = params;
  const rationale: string[] = [];

  // Status context
  if (status === "in_progress") {
    rationale.push("Already in progress this term.");
  } else if (status === "planned") {
    rationale.push("Already planned in a future term.");
  }

  // Prerequisite readiness
  if (prsResult.unmetPrereqs.length > 0) {
    rationale.push(`Prerequisites still needed: ${prsResult.unmetPrereqs.join(", ")}.`);
  } else if (prsResult.weakPrereqs.length > 0) {
    rationale.push(`Prerequisites in progress or planned: ${prsResult.weakPrereqs.join(", ")}.`);
  } else if (prereqCodes.length > 0) {
    rationale.push("All prerequisites satisfied — you're ready for this course.");
  }

  // Urgency / why now
  if (blocksCount >= 2) {
    rationale.push(`Unlocks ${blocksCount} other required courses — taking it sooner keeps options open.`);
  } else if (blocksCount === 1) {
    rationale.push("Prerequisite for another required course in your program.");
  }

  if (level < 200) {
    rationale.push(`Gateway-level course for your ${bundle.kind} — best taken early.`);
  } else if (level >= 400 && termsRemaining <= 3) {
    rationale.push("Upper-level course to complete before graduation.");
  } else if (level >= 300) {
    rationale.push("Mid-level major course; consider after gateway classes are done.");
  }

  // Double-dip
  if (doubleDipTags.length > 0) {
    rationale.push(`Also satisfies Gen Ed: ${doubleDipTags.join(", ")}.`);
  }

  // Fallback if we generated nothing useful
  if (rationale.length === 0) {
    rationale.push(`Required for your ${bundle.programName} ${bundle.kind}.`);
  }

  return rationale;
}

// ── Recommendation priority (used by generateRecommendationPlan) ──

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

// ── Term assignment planner (unchanged) ──

export function generateRecommendationPlan(params: {
  items: NeededClassItem[];
  timeline: RecommendationTimelineTerm[];
  minCreditsPerTerm?: number;
  maxCreditsPerTerm?: number;
  preferredCreditsPerTerm?: number;
  strictPriorTermsOnly?: boolean;
}): RecommendationPlanResult {
  const {
    items,
    timeline,
    minCreditsPerTerm = 12,
    maxCreditsPerTerm = 16,
    preferredCreditsPerTerm,
    strictPriorTermsOnly = false,
  } = params;
  const scheduleTerms = timeline.length > 0 ? timeline : [];

  const courseItems = items
    .filter((item) => item.kind === "course" && item.courseCode)
    .map((item) => ({ ...item, courseCode: item.courseCode! }));

  const others = items.filter((item) => item.kind !== "course");

  const totalNeededCredits = items.reduce((sum, item) => sum + Math.max(0, Number(item.credits) || 0), 0);
  const remainingTerms = Math.max(1, scheduleTerms.length);
  const balanced = Math.ceil(totalNeededCredits / remainingTerms);
  const requestedTarget = Number(preferredCreditsPerTerm ?? balanced) || balanced;
  const targetCredits = Math.max(minCreditsPerTerm, Math.min(maxCreditsPerTerm, requestedTarget));
  const hardCapacityPerTerm = maxCreditsPerTerm + 2;

  const byCode = new Map(courseItems.map((item) => [item.courseCode, item]));
  const internalPrereqs = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const item of courseItems) {
    const prereqs = item.prereqCodes
      .map((code) => resolveEquivalentCodeInMap(byCode, code))
      .filter((code): code is string => Boolean(code));
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
    const strictReadySnapshot = strictPriorTermsOnly ? [...ready] : [];

    while (ready.length > 0) {
      const nextCode = strictPriorTermsOnly ? strictReadySnapshot.find((code) => unassigned.has(code)) : ready[0];
      if (!nextCode) break;
      const nextItem = byCode.get(nextCode)!;
      const nextCredits = Math.max(1, Number(nextItem.credits) || 3);
      if (used + nextCredits > hardCapacityPerTerm) break;

      assignedByTerm.set(term.id, [...(assignedByTerm.get(term.id) ?? []), nextCode]);
      used += nextCredits;
      unassigned.delete(nextCode);

      if (!strictPriorTermsOnly) {
        for (const dependent of dependents.get(nextCode) ?? []) {
          indegree.set(dependent, Math.max(0, (indegree.get(dependent) ?? 0) - 1));
        }
      }

      if (used >= targetCredits) break;
      ready = strictPriorTermsOnly
        ? strictReadySnapshot.filter((code) => unassigned.has(code))
        : getReadyCourses();
    }

    if (strictPriorTermsOnly) {
      const termAssigned = assignedByTerm.get(term.id) ?? [];
      for (const completedThisTerm of termAssigned) {
        for (const dependent of dependents.get(completedThisTerm) ?? []) {
          indegree.set(dependent, Math.max(0, (indegree.get(dependent) ?? 0) - 1));
        }
      }
    }
  }

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
