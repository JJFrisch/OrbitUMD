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
  courses: ParsedTranscriptCourse[];
  summary: TranscriptSummary;
}

export type TranscriptCourseSource = "AP" | "IB" | "transfer" | "transcript";

export interface ParsedTranscriptCourse {
  sourceType: TranscriptCourseSource;
  courseCode: string | null;
  title: string;
  credits: number;
  grade: string | null;
  termLabel: string | null;
  countsTowardProgress: boolean;
  genEdCodes: string[];
  rawLine: string;
}

export interface TranscriptSummary {
  totalCreditsEarned: number | null;
  totalCreditsAttempted: number | null;
  totalParsedCourses: number;
  totalPassingCourses: number;
  apCredits: number;
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

const PASSING_GRADES = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "P", "S", "CR"]);
const NON_PROGRESS_GRADES = new Set(["F", "W", "WP", "WF", "I", "IP", "NG", "NC", "AU"]);
const GRADE_PATTERN = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|CR|W|WP|WF|I|IP|NG|NC|AU)$/i;
const COURSE_CODE_PATTERN = /^[A-Z]{2,5}\s?\d{3}[A-Z]?$/i;
const GEN_ED_TOKEN_PATTERN = /^(FSAW|FSAR|FSMA|FSOC|SCIS|DSHS|DSHU|DSNS|DSNL|DSSP|DVUP|DVCC)$/i;

type TranscriptSection = "none" | "transfer_credit" | "historic" | "current";

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
  const asOfIndex = lines.findIndex((line) => /^As of:/i.test(line));
  if (asOfIndex >= 0) {
    const nearby = lines.slice(asOfIndex + 1, asOfIndex + 5).find((line) => /^[A-Za-z'., -]+$/.test(line) && !/e-mail|major|freshman|degree/i.test(line));
    if (nearby) return nearby;
  }

  const emailIndex = lines.findIndex((line) => /^E-Mail:/i.test(line));
  if (emailIndex > 0) {
    const preceding = lines[emailIndex - 1];
    if (/^[A-Za-z'., -]+$/.test(preceding)) {
      return cleanFieldValue(preceding);
    }
  }

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
  const doubleDegree = extractLabeledValue(lines, ["Double Degree"]);
  if (doubleDegree) return "Double Degree";

  const degreeSeeking = lines.find((line) => /degree seeking/i.test(line));
  if (degreeSeeking) return cleanFieldValue(degreeSeeking);

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
  const standingLine = lines.find((line) => /(Freshman|Sophomore|Junior|Senior|Graduate)/i.test(line) && /degree seeking|undergraduate|first time/i.test(line));
  if (standingLine) {
    const match = standingLine.match(/(Freshman|Sophomore|Junior|Senior|Graduate)/i);
    if (match?.[1]) return cleanFieldValue(match[1]);
  }

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
  const historicCollege = lines.find((line) => /\bCOLLEGE:/i.test(line));
  if (historicCollege) {
    const match = historicCollege.match(/\bCOLLEGE:\s*(.+)$/i);
    if (match?.[1]) return cleanFieldValue(match[1]);
  }

  const labeled = extractLabeledValue(lines, ["College", "School"]);
  if (labeled && !/^park$/i.test(labeled)) return labeled;
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
  const cumulativeLine = lines.find((line) => /^UG Cumulative GPA\s*:/i.test(line));
  if (cumulativeLine) {
    const match = cumulativeLine.match(/(\d\.\d{1,3})/);
    if (match?.[1]) return match[1];
  }

  const labeled = extractLabeledValue(lines, ["Cumulative GPA", "Overall GPA", "Cum GPA"]);
  const labeledValue = labeled?.match(/\b\d\.\d{1,3}\b/);
  if (labeledValue?.[0]) return labeledValue[0];

  const match = text.match(/(?:Cumulative GPA|Overall GPA|Cum GPA)[^\d]{0,10}(\d\.\d{1,3})/i);
  return match?.[1] ?? null;
}

function normalizeCourseCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function detectTranscriptSource(line: string): TranscriptCourseSource | null {
  if (/advanced placement|\bap credits?\b|\bap test/i.test(line)) return "AP";
  if (/international baccalaureate|\bib credits?\b/i.test(line)) return "IB";
  if (/transfer credits?|transfer coursework/i.test(line)) return "transfer";
  return null;
}

function isTermHeading(line: string): boolean {
  return /^(Spring|Summer|Fall|Winter)\s+20\d{2}$/i.test(line);
}

function isProgressGrade(grade: string | null): boolean {
  if (!grade) return true;
  const normalized = grade.toUpperCase();
  if (NON_PROGRESS_GRADES.has(normalized)) return false;
  return PASSING_GRADES.has(normalized) || /^[ABCDF][+-]?$/i.test(normalized);
}

function parseGenEdTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(/[^A-Z]+/i)
      .map((token) => token.trim().toUpperCase())
      .filter((token) => GEN_ED_TOKEN_PATTERN.test(token)),
  ));
}

function parseTransferCreditLine(line: string, currentSource: TranscriptCourseSource): ParsedTranscriptCourse | null {
  if (/^(Acceptable UG Inst\. Credits|Applicable UG Inst\. Credits|Total UG Credits|Transcripts received|Fundamental Requirement|Historic Course Information)/i.test(line)) {
    return null;
  }

  const match = line.match(/^(.*?)\s+(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|P|S|CR)\s+(\d+\.\d{2})\s+(.+)$/i);
  if (!match) return null;

  const [, sourceTitle, gradeToken, creditsToken, equivalenceTail] = match;
  const credits = Number(creditsToken);
  if (!Number.isFinite(credits)) return null;

  const codeMatch = equivalenceTail.match(/\b([A-Z]{2,5}\s?\d{3}[A-Z]?)\b/);
  const courseCode = codeMatch?.[1] ? normalizeCourseCode(codeMatch[1]) : null;
  const genEdCodes = parseGenEdTokens(equivalenceTail);
  const countsTowardProgress = credits > 0 && !/no credit/i.test(equivalenceTail);

  return {
    sourceType: currentSource,
    courseCode,
    title: cleanFieldValue(sourceTitle) ?? line,
    credits,
    grade: gradeToken.toUpperCase(),
    termLabel: "Prior to UMD",
    countsTowardProgress,
    genEdCodes,
    rawLine: line,
  };
}

function parseHistoricCourseLine(line: string, currentTerm: string | null): ParsedTranscriptCourse | null {
  if (!currentTerm) return null;
  if (/^(Semester:|UG Cumulative:|UG Cumulative Credit|UG Cumulative GPA|MAJOR:|Course, Title, Grade|\*\* Semester Academic Honors \*\*)/i.test(line)) {
    return null;
  }

  const match = line.match(/^([A-Z]{4}\d{3}[A-Z]?)\s+(.+?)\s+(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|CR|W|WP|WF|I|IP|NG|NC|AU)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+(.+))?$/i);
  if (!match) return null;

  const [, courseCodeRaw, title, gradeToken, _attemptedToken, earnedToken, _qualityPoints, tagTail] = match;
  const earnedCredits = Number(earnedToken);
  if (!Number.isFinite(earnedCredits)) return null;

  const grade = gradeToken.toUpperCase();
  return {
    sourceType: "transcript",
    courseCode: normalizeCourseCode(courseCodeRaw),
    title: cleanFieldValue(title) ?? courseCodeRaw,
    credits: earnedCredits,
    grade,
    termLabel: currentTerm,
    countsTowardProgress: earnedCredits > 0 && isProgressGrade(grade),
    genEdCodes: parseGenEdTokens(tagTail),
    rawLine: line,
  };
}

function extractSummaryNumber(lines: string[], labels: string[]): number | null {
  const value = extractLabeledValue(lines, labels);
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  return Number(match[0]);
}

function parseTranscriptCourseLine(line: string, currentTerm: string | null, currentSource: TranscriptCourseSource): ParsedTranscriptCourse | null {
  if (/\b(total|gpa|standing|credits earned|credits attempted|cumulative|academic status|program and plan|student name|college)\b/i.test(line)) {
    return null;
  }

  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  let codeIndex = -1;
  let codeSpan = 1;
  let courseCode: string | null = null;

  for (let index = 0; index < Math.min(tokens.length, 5); index += 1) {
    const single = tokens[index];
    if (COURSE_CODE_PATTERN.test(single)) {
      codeIndex = index;
      codeSpan = 1;
      courseCode = normalizeCourseCode(single);
      break;
    }
    if (index + 1 < tokens.length) {
      const combined = `${tokens[index]}${tokens[index + 1]}`;
      if (COURSE_CODE_PATTERN.test(combined)) {
        codeIndex = index;
        codeSpan = 2;
        courseCode = normalizeCourseCode(combined);
        break;
      }
    }
  }

  const numericIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token, index }) => index > codeIndex && /^\d+(?:\.\d+)?$/.test(token));
  const gradeIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token, index }) => index > codeIndex && index >= tokens.length - 2 && GRADE_PATTERN.test(token));

  if (courseCode === null && currentSource !== "AP" && currentSource !== "IB" && currentSource !== "transfer") {
    return null;
  }

  const creditCandidate = numericIndexes.at(-1) ?? null;
  if (!creditCandidate) return null;
  const credits = Number(creditCandidate.token);
  if (!Number.isFinite(credits)) return null;

  const gradeCandidate = gradeIndexes.at(-1) ?? null;
  const stopIndex = Math.min(
    creditCandidate.index,
    gradeCandidate?.index ?? creditCandidate.index,
  );
  const titleTokens = tokens.slice(Math.max(0, codeIndex + codeSpan), stopIndex).filter((token) => token !== "-");

  const title = titleTokens.join(" ").trim();
  if (!title && !courseCode) return null;

  const ambiguousIncompleteGrade = (
    gradeCandidate?.token?.toUpperCase() === "I"
    && currentSource !== "transcript"
    && gradeIndexes.length === 1
  );
  const grade = ambiguousIncompleteGrade ? null : (gradeCandidate?.token?.toUpperCase() ?? null);
  return {
    sourceType: currentSource,
    courseCode,
    title: title || courseCode || line.trim(),
    credits,
    grade,
    termLabel: currentSource === "AP" || currentSource === "IB" ? "Prior to UMD" : currentTerm,
    countsTowardProgress: isProgressGrade(grade),
    genEdCodes: [],
    rawLine: line,
  };
}

function extractTranscriptCourses(lines: string[]): ParsedTranscriptCourse[] {
  const courses: ParsedTranscriptCourse[] = [];
  let currentTerm: string | null = null;
  let currentSource: TranscriptCourseSource = "transcript";
  let section: TranscriptSection = "none";

  for (const line of lines) {
    if (/^\*\* Transfer Credit Information \*\*/i.test(line)) {
      section = "transfer_credit";
      currentSource = "AP";
      currentTerm = "Prior to UMD";
      continue;
    }
    if (/^Historic Course Information is listed/i.test(line)) {
      section = "historic";
      currentSource = "transcript";
      currentTerm = null;
      continue;
    }
    if (/^\*\* Current Course Information \*\*/i.test(line)) {
      section = "current";
      currentSource = "transcript";
      continue;
    }

    const nextSource = detectTranscriptSource(line);
    if (section === "transfer_credit" && nextSource) {
      currentSource = nextSource;
      continue;
    }

    if (section === "transfer_credit" && /university|college|institute/i.test(line) && !/registrar|college park/i.test(line) && !/^As of:/i.test(line)) {
      currentSource = line.toLowerCase().includes("advanced placement") ? "AP" : "transfer";
      continue;
    }

    if (section === "historic" && isTermHeading(line)) {
      currentTerm = line;
      currentSource = "transcript";
      continue;
    }

    let parsed: ParsedTranscriptCourse | null = null;
    if (section === "transfer_credit") {
      parsed = parseTransferCreditLine(line, currentSource);
    } else if (section === "historic") {
      parsed = parseHistoricCourseLine(line, currentTerm);
    }

    if (parsed) {
      courses.push(parsed);
    }
  }

  return courses;
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
  const courses = extractTranscriptCourses(lines);
  const totalCreditsEarned = (() => {
    const cumulativeCredit = extractSummaryNumber(lines, ["UG Cumulative Credit"]);
    if (cumulativeCredit !== null) return cumulativeCredit;
    return extractSummaryNumber(lines, ["Credits Earned", "Total Credits Earned", "Units Passed", "Earned Hours", "Total UG Credits Applicable"]);
  })();
  const totalCreditsAttempted = (() => {
    const cumulativeLine = lines.find((line) => /^UG Cumulative:/i.test(line));
    const values = cumulativeLine?.match(/\d+\.\d+/g) ?? [];
    if (values.length >= 2) {
      return Number(values[0]);
    }
    return extractSummaryNumber(lines, ["Credits Attempted", "Total Credits Attempted", "Units Attempted", "Attempted Hours"]);
  })();

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
    courses,
    summary: {
      totalCreditsEarned,
      totalCreditsAttempted,
      totalParsedCourses: courses.length,
      totalPassingCourses: courses.filter((course) => course.countsTowardProgress).length,
      apCredits: courses
        .filter((course) => course.sourceType === "AP")
        .reduce((sum, course) => sum + course.credits, 0),
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
