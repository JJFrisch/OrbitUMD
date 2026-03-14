import type { RequirementBlockV2, RequirementItemV2, StudentCourseV2, BlockEvaluationResultV2 } from "@/lib/types/requirements";

interface EvalContext {
  blocksById: Map<string, RequirementBlockV2>;
  childrenByParentId: Map<string | null, RequirementBlockV2[]>;
  itemsByBlockId: Map<string, RequirementItemV2[]>;
}

interface LeafEvalResult {
  satisfied: boolean;
  usedCourses: StudentCourseV2[];
  remainingCourses: number | null;
  remainingCredits: number | null;
  messages: string[];
}

export function buildEvalContextV2(
  blocks: RequirementBlockV2[],
  items: RequirementItemV2[],
): EvalContext {
  const blocksById = new Map<string, RequirementBlockV2>();
  const childrenByParentId = new Map<string | null, RequirementBlockV2[]>();
  const itemsByBlockId = new Map<string, RequirementItemV2[]>();

  for (const block of blocks) {
    blocksById.set(block.id, block);
    const key = block.parentRequirementId;
    const current = childrenByParentId.get(key) ?? [];
    current.push(block);
    childrenByParentId.set(key, current);
  }

  for (const value of childrenByParentId.values()) {
    value.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  for (const item of items) {
    const current = itemsByBlockId.get(item.requirementBlockId) ?? [];
    current.push(item);
    itemsByBlockId.set(item.requirementBlockId, current);
  }

  for (const value of itemsByBlockId.values()) {
    value.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { blocksById, childrenByParentId, itemsByBlockId };
}

export function evaluateProgramRequirementsV2(
  ctx: EvalContext,
  studentCourses: StudentCourseV2[],
): BlockEvaluationResultV2[] {
  const roots = ctx.childrenByParentId.get(null) ?? [];
  return roots.map((root) => evaluateBlock(ctx, root, studentCourses));
}

function evaluateBlock(
  ctx: EvalContext,
  block: RequirementBlockV2,
  studentCourses: StudentCourseV2[],
): BlockEvaluationResultV2 {
  const items = ctx.itemsByBlockId.get(block.id) ?? [];
  const children = ctx.childrenByParentId.get(block.id) ?? [];
  const childResults = children.map((child) => evaluateBlock(ctx, child, studentCourses));
  const leaf = evaluateLeafItems(block, items, studentCourses);

  const satisfied = leaf.satisfied && childResults.every((result) => result.satisfied);

  return {
    block,
    satisfied,
    usedCourses: leaf.usedCourses,
    remainingCourses: leaf.remainingCourses,
    remainingCredits: leaf.remainingCredits,
    messages: leaf.messages,
    children: childResults,
    overrideApplied: false,
  };
}

function evaluateLeafItems(
  block: RequirementBlockV2,
  items: RequirementItemV2[],
  studentCourses: StudentCourseV2[],
): LeafEvalResult {
  switch (block.type) {
    case "ALL_OF": {
      if (items.length === 0) {
        return {
          satisfied: true,
          usedCourses: [],
          remainingCourses: 0,
          remainingCredits: null,
          messages: [],
        };
      }

      const used: StudentCourseV2[] = [];
      const messages: string[] = [];
      let ok = true;

      for (const item of items) {
        if (item.itemType === "COURSE") {
          const subject = String(item.payload.subject ?? "").toUpperCase();
          const number = String(item.payload.number ?? "").toUpperCase();
          const hit = studentCourses.find((course) =>
            course.subject.toUpperCase() === subject &&
            course.number.toUpperCase() === number &&
            passed(course.grade),
          );

          if (hit) {
            used.push(hit);
          } else {
            ok = false;
            messages.push(`Missing required course ${subject}${number}.`);
          }
        } else if (item.itemType === "COURSE_GROUP") {
          const courses = Array.isArray(item.payload.courses)
            ? item.payload.courses as Array<{ subject?: string; number?: string }>
            : [];

          const groupHits = courses.map((target) => {
            const subject = String(target.subject ?? "").toUpperCase();
            const number = String(target.number ?? "").toUpperCase();
            return studentCourses.find((course) =>
              course.subject.toUpperCase() === subject &&
              course.number.toUpperCase() === number &&
              passed(course.grade),
            );
          });

          if (groupHits.every(Boolean)) {
            for (const hit of groupHits) {
              if (hit) used.push(hit);
            }
          } else {
            ok = false;
            messages.push("Missing one or more courses from a required course pair/group.");
          }
        } else if (item.itemType === "TEXT_RULE") {
          const text = String(item.payload.text ?? "").trim();
          if (text) {
            // We intentionally keep fuzzy catalog footnotes as text-only rules until
            // we model them with first-class constraints (e.g. level-count, anti-double-count).
            messages.push(`Rule: ${text}`);
          }
        }
      }

      return {
        satisfied: ok,
        usedCourses: dedupeCourses(used),
        remainingCourses: ok ? 0 : null,
        remainingCredits: null,
        messages,
      };
    }

    case "SELECT_N": {
      if (items.length === 0) {
        return {
          satisfied: false,
          usedCourses: [],
          remainingCourses: Number(block.params.nCourses ?? 1),
          remainingCredits: null,
          messages: ["No selectable course items were defined for this block."],
        };
      }

      const requested = Number(block.params.nCourses ?? 1);
      const n = Number.isFinite(requested) && requested > 0 ? requested : 1;
      const matched: StudentCourseV2[] = [];

      for (const item of items) {
        if (item.itemType !== "COURSE") continue;
        const subject = String(item.payload.subject ?? "").toUpperCase();
        const number = String(item.payload.number ?? "").toUpperCase();
        const hit = studentCourses.find((course) =>
          course.subject.toUpperCase() === subject &&
          course.number.toUpperCase() === number &&
          passed(course.grade),
        );
        if (hit) matched.push(hit);
      }

      const unique = dedupeCourses(matched);
      const have = unique.length;
      const remaining = Math.max(0, n - have);

      return {
        satisfied: have >= n,
        usedCourses: unique.slice(0, n),
        remainingCourses: remaining,
        remainingCredits: null,
        messages: have >= n ? [] : [`Need ${n} courses from this list, have ${have}.`],
      };
    }

    case "CREDITS_MIN": {
      const minCreditsRaw = Number(block.params.minCredits ?? 0);
      const minCredits = Number.isFinite(minCreditsRaw) ? minCreditsRaw : 0;
      const subjects = Array.isArray(block.params.subjects)
        ? (block.params.subjects as unknown[])
            .map((value) => String(value).toUpperCase())
            .filter(Boolean)
        : null;
      const minLevelRaw = Number(block.params.minLevel ?? 0);
      const minLevel = Number.isFinite(minLevelRaw) && minLevelRaw > 0 ? minLevelRaw : null;

      const eligible = studentCourses.filter((course) => {
        if (!passed(course.grade)) return false;

        if (subjects && !subjects.includes(course.subject.toUpperCase())) {
          return false;
        }

        if (minLevel !== null) {
          const courseLevel = Number.parseInt(course.number.slice(0, 3), 10);
          if (!Number.isFinite(courseLevel) || courseLevel < minLevel) {
            return false;
          }
        }

        return true;
      });

      const earned = eligible.reduce((sum, course) => sum + course.credits, 0);
      const remaining = Math.max(0, minCredits - earned);

      return {
        satisfied: earned >= minCredits,
        usedCourses: dedupeCourses(eligible),
        remainingCourses: null,
        remainingCredits: remaining,
        messages: earned >= minCredits ? [] : [`Need ${minCredits} credits, have ${earned}.`],
      };
    }

    default: {
      const messages = items
        .filter((item) => item.itemType === "TEXT_RULE")
        .map((item) => String(item.payload.text ?? "").trim())
        .filter(Boolean)
        .map((text) => `Rule: ${text}`);

      return {
        satisfied: true,
        usedCourses: [],
        remainingCourses: null,
        remainingCredits: null,
        messages,
      };
    }
  }
}

function passed(grade: string | null): boolean {
  if (!grade) return true;
  const normalized = grade.trim().toUpperCase();
  return !["F", "XF", "FX"].includes(normalized);
}

function dedupeCourses(courses: StudentCourseV2[]): StudentCourseV2[] {
  const seen = new Set<string>();
  const out: StudentCourseV2[] = [];

  for (const course of courses) {
    const key = `${course.subject.toUpperCase()}-${course.number.toUpperCase()}-${course.term ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(course);
  }

  return out;
}
