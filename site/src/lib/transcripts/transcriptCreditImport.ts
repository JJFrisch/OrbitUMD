import type { SavePriorCreditInput } from "@/lib/repositories/priorCreditsRepository";
import { lookupCourseDetails } from "@/lib/requirements/courseDetailsLoader";
import type { TranscriptParseResult } from "./unofficialTranscriptParser";

export interface TranscriptImportSummary {
  importedRecords: number;
  countedRecords: number;
  totalCredits: number;
  apCredits: number;
  uniqueGenEds: string[];
}

export interface TranscriptImportBuildResult {
  records: SavePriorCreditInput[];
  summary: TranscriptImportSummary;
}

function normalizeCourseCode(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

export async function buildTranscriptPriorCreditImport(
  parsed: TranscriptParseResult,
): Promise<TranscriptImportBuildResult> {
  const courseCodes = Array.from(new Set(
    parsed.courses
      .map((course) => normalizeCourseCode(course.courseCode))
      .filter((value): value is string => Boolean(value)),
  ));
  const detailsByCode = courseCodes.length > 0 ? await lookupCourseDetails(courseCodes) : new Map();

  const records: SavePriorCreditInput[] = parsed.courses.map((course) => {
    const normalizedCode = normalizeCourseCode(course.courseCode);
    const details = normalizedCode ? detailsByCode.get(normalizedCode) : undefined;
    const genEdCodes = details?.genEds ?? [];
    const credits = course.credits > 0 ? course.credits : (details?.credits ?? 0);

    return {
      sourceType: course.sourceType,
      importOrigin: "testudo_transcript",
      originalName: course.title,
      umdCourseCode: normalizedCode,
      credits,
      genEdCodes,
      termAwarded: course.termLabel ?? undefined,
      grade: course.grade ?? undefined,
      countsTowardProgress: course.countsTowardProgress,
    } satisfies SavePriorCreditInput;
  });

  const uniqueGenEds = Array.from(new Set(records.flatMap((record) => record.genEdCodes ?? []))).sort();
  const countedRecords = records.filter((record) => record.countsTowardProgress !== false);

  return {
    records,
    summary: {
      importedRecords: records.length,
      countedRecords: countedRecords.length,
      totalCredits: countedRecords.reduce((sum, record) => sum + (Number(record.credits ?? 0) || 0), 0),
      apCredits: records
        .filter((record) => record.sourceType === "AP")
        .reduce((sum, record) => sum + (Number(record.credits ?? 0) || 0), 0),
      uniqueGenEds,
    },
  };
}
