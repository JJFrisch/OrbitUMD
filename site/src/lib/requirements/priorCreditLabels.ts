type PriorCreditLike = {
  id: string;
  umdCourseCode?: string | null;
  genEdCodes?: string[] | null;
  originalName?: string | null;
};

function normalizeCodeList(values: string[]): string[] {
  return values
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function buildFallbackLabels(credit: PriorCreditLike): string[] {
  const labels: string[] = [];

  labels.push(
    ...normalizeCodeList(Array.isArray(credit.genEdCodes) ? credit.genEdCodes.map(String) : []),
  );

  const originalName = String(credit.originalName ?? "").trim();
  if (/lower\s*level\s*elective/i.test(originalName)) {
    labels.push("LOWER LEVEL ELECTIVE");
  }

  if (/upper\s*level\s*elective/i.test(originalName)) {
    labels.push("UPPER LEVEL ELECTIVE");
  }

  return Array.from(new Set(labels));
}

export function resolvePriorCreditCourseCodes(credit: PriorCreditLike): string[] {
  const explicitCodes = normalizeCodeList(
    String(credit.umdCourseCode ?? "")
      .split(/[|,]/)
      .map((value) => String(value ?? "")),
  );

  if (explicitCodes.length > 0) {
    return explicitCodes;
  }

  const fallbackLabels = buildFallbackLabels(credit);
  if (fallbackLabels.length > 0) {
    return fallbackLabels;
  }

  return [`PRIOR CREDIT ${String(credit.id).slice(0, 8).toUpperCase()}`];
}
