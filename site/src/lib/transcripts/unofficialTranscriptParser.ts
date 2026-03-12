export interface ParsedTranscriptFields {
  fullName: string | null;
  email: string | null;
  universityUid: string | null;
  major: string | null;
  degree: string | null;
  classStanding: string | null;
  cumulativeGpa: string | null;
  admitTerm: string | null;
  graduationYear: string | null;
  college: string | null;
}

export interface TranscriptParseResult {
  fileName: string;
  pageCount: number;
  rawText: string;
  fields: ParsedTranscriptFields;
}

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (source: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
      }>;
    }>;
  };
};

const EMPTY_FIELDS: ParsedTranscriptFields = {
  fullName: null,
  email: null,
  universityUid: null,
  major: null,
  degree: null,
  classStanding: null,
  cumulativeGpa: null,
  admitTerm: null,
  graduationYear: null,
  college: null,
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanFieldValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeWhitespace(value)
    .replace(/^(none|n\/a|na)$/i, "")
    .replace(/[|]+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function splitLines(text: string): string[] {
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractLabeledValue(lines: string[], labels: string[]): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const label of labels) {
      const inlinePattern = new RegExp(`(?:^|\\b)${escapeRegExp(label)}\\s*[:\\-]?\\s*(.+)$`, "i");
      const inlineMatch = line.match(inlinePattern);
      if (inlineMatch?.[1]) {
        return cleanFieldValue(inlineMatch[1]);
      }

      const labelOnlyPattern = new RegExp(`^${escapeRegExp(label)}\\s*[:\\-]?\\s*$`, "i");
      if (labelOnlyPattern.test(line)) {
        return cleanFieldValue(lines[index + 1]);
      }
    }
  }
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanFieldValue(match[1]);
    }
    if (match?.[0]) {
      return cleanFieldValue(match[0]);
    }
  }
  return null;
}

function cleanMajorValue(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b(B\.\s*S\.?|B\.\s*A\.?|BS|BA|Bachelor of Science|Bachelor of Arts|Double Degree|Second Major)\b/gi, "")
    .replace(/\b(major|program|plan|curriculum)\b/gi, "")
    .replace(/[,:-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > 1 ? cleaned : null;
}

function extractName(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Student Name", "Name"]);
  if (labeled) return labeled;

  const headerCandidate = lines.slice(0, 20).find((line) => (
    /^[A-Za-z'., -]+$/.test(line)
    && !/transcript|university|college park|student copy|page \d+/i.test(line)
    && line.length >= 6
  ));
  if (headerCandidate) return headerCandidate;

  return firstMatch(text, [/(?:Student Name|Name)\s*[:\-]\s*([A-Za-z'., -]{4,80})/i]);
}

function extractDegree(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Degree", "Academic Career", "Program and Plan"]);
  if (labeled) {
    const degreeMatch = labeled.match(/(Bachelor of Science|Bachelor of Arts|Double Degree|Second Major|B\.\s*S\.?|B\.\s*A\.?|BS|BA)/i);
    if (degreeMatch?.[1]) return cleanFieldValue(degreeMatch[1]);
  }

  return firstMatch(text, [
    /\b(Bachelor of Science|Bachelor of Arts|Double Degree|Second Major)\b/i,
    /\b(B\.\s*S\.?|B\.\s*A\.?|BS|BA)\b/i,
  ]);
}

function extractMajor(lines: string[], text: string): string | null {
  const labeled = cleanMajorValue(extractLabeledValue(lines, [
    "Primary Major",
    "Major",
    "Program and Plan",
    "Academic Program",
    "Plan",
    "Curriculum",
  ]));
  if (labeled) return labeled;

  const regexValue = cleanMajorValue(firstMatch(text, [
    /(?:Primary Major|Major|Academic Program|Program and Plan|Plan|Curriculum)\s*[:\-]\s*([^\n]{3,80})/i,
  ]));
  if (regexValue) return regexValue;

  return null;
}

function extractClassStanding(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Class Standing", "Class"]);
  if (labeled) return labeled;
  return firstMatch(text, [/\b(Freshman|Sophomore|Junior|Senior|Graduate|Post-Baccalaureate)\b/i]);
}

function extractGraduationYear(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Expected Graduation", "Graduation Year", "Expected Degree Date"]);
  const labeledYear = labeled?.match(/(20\d{2})/);
  if (labeledYear?.[1]) return labeledYear[1];
  const textYear = text.match(/(?:Expected Graduation|Graduation Year|Expected Degree Date)[^\n]{0,30}(20\d{2})/i);
  return textYear?.[1] ?? null;
}

function extractAdmitTerm(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Admit Term", "Matriculation Term", "Program Status"]);
  const labeledTerm = labeled?.match(/(Fall|Spring|Summer|Winter)\s+20\d{2}/i);
  if (labeledTerm?.[0]) return cleanFieldValue(labeledTerm[0]);
  const textTerm = text.match(/(?:Admit Term|Matriculation Term)[^\n]{0,30}((?:Fall|Spring|Summer|Winter)\s+20\d{2})/i);
  return cleanFieldValue(textTerm?.[1]);
}

function extractCollege(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["College", "School"]);
  if (labeled) return labeled;
  return firstMatch(text, [/(College of [A-Za-z& ,]+)/i, /(School of [A-Za-z& ,]+)/i]);
}

function extractEmail(text: string): string | null {
  return firstMatch(text, [/[A-Z0-9._%+-]+@(?:terpmail\.)?umd\.edu/i]);
}

function extractUniversityUid(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["UID", "University UID", "University ID", "Student ID"]);
  const labeledDigits = labeled?.match(/\b\d{9}\b/);
  if (labeledDigits?.[0]) return labeledDigits[0];

  const textMatch = text.match(/(?:UID|University UID|University ID|Student ID)[^\d]{0,12}(\d{9})/i);
  if (textMatch?.[1]) return textMatch[1];
  return null;
}

function extractCumulativeGpa(lines: string[], text: string): string | null {
  const labeled = extractLabeledValue(lines, ["Cumulative GPA", "Overall GPA", "Cum GPA"]);
  const labeledValue = labeled?.match(/\b\d\.\d{1,3}\b/);
  if (labeledValue?.[0]) return labeledValue[0];

  const match = text.match(/(?:Cumulative GPA|Overall GPA|Cum GPA)[^\d]{0,10}(\d\.\d{1,3})/i);
  return match?.[1] ?? null;
}

function sortPdfItems(items: PdfTextItem[]): Array<PdfTextItem & { x: number; y: number }> {
  return items
    .filter((item) => typeof item.str === "string" && Array.isArray(item.transform) && item.transform.length >= 6)
    .map((item) => ({
      ...item,
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
    }))
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 2) {
        return right.y - left.y;
      }
      return left.x - right.x;
    });
}

function textFromPdfItems(items: PdfTextItem[]): string {
  const sorted = sortPdfItems(items);
  const lines: string[] = [];
  let currentY: number | null = null;
  let currentLine: string[] = [];

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > 2) {
      if (currentLine.length > 0) {
        lines.push(normalizeWhitespace(currentLine.join(" ")));
      }
      currentY = item.y;
      currentLine = [];
    }
    if (item.str) {
      currentLine.push(item.str);
    }
  }

  if (currentLine.length > 0) {
    lines.push(normalizeWhitespace(currentLine.join(" ")));
  }

  return lines.join("\n");
}

export function parseUnofficialTranscriptText(text: string, fileName: string = "transcript.pdf", pageCount: number = 0): TranscriptParseResult {
  const normalizedText = normalizeWhitespace(text);
  const lines = splitLines(normalizedText);

  return {
    fileName,
    pageCount,
    rawText: normalizedText,
    fields: {
      ...EMPTY_FIELDS,
      fullName: extractName(lines, normalizedText),
      email: extractEmail(normalizedText),
      universityUid: extractUniversityUid(lines, normalizedText),
      major: extractMajor(lines, normalizedText),
      degree: extractDegree(lines, normalizedText),
      classStanding: extractClassStanding(lines, normalizedText),
      cumulativeGpa: extractCumulativeGpa(lines, normalizedText),
      admitTerm: extractAdmitTerm(lines, normalizedText),
      graduationYear: extractGraduationYear(lines, normalizedText),
      college: extractCollege(lines, normalizedText),
    },
  };
}

export async function parseUnofficialTranscriptFile(file: File): Promise<TranscriptParseResult> {
  const [{ GlobalWorkerOptions, getDocument }, workerModule] = await Promise.all([
    import("pdfjs-dist") as Promise<PdfJsModule>,
    import("pdfjs-dist/build/pdf.worker.min.mjs?url") as Promise<{ default: string }>,
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const fileBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textFromPdfItems(textContent.items as PdfTextItem[]));
  }

  return parseUnofficialTranscriptText(pages.join("\n\n"), file.name, pdf.numPages);
}
