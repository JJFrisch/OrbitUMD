export interface ParsedTranscriptFields {
  fullName: string | null;
  email: string | null;
  universityUid: string | null;
  major: string | null;
  degree: string | null;
  classStanding: string | null;
  degreeSeekingStatus: string | null;
  genEdProgram: string | null;
  cumulativeGpa: string | null;
  admitTerm: string | null;
  graduationYear: string | null;
  college: string | null;
  asOfDate: string | null;
  doubleDegrees: string[];
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

export interface TransferItem {
  externalCode: string | null;
  description: string;
  grade: string | null;
  credits: number;
  umdEquivalentCourse: string | null;
  genEds: string[];
  notation: string | null;
  rawLine: string;
}

export interface TransferInstitution {
  name: string;
  receivedDate: string | null;
  items: TransferItem[];
  acceptableCredits: number | null;
  applicableCredits: number | null;
}

export interface HistoricCourse {
  courseCode: string;
  dept: string;
  number: string;
  suffix: string | null;
  title: string;
  grade: string;
  creditsAttempted: number;
  creditsEarned: number;
  qualityPoints: number;
  genEds: string[];
  rawLine: string;
}

export interface HistoricTermSummary {
  attempted: number;
  earned: number;
  qualityPoints: number;
  gpa: number;
}

export interface HistoricTerm {
  termName: string;
  year: number;
  termLabel: string;
  major: string | null;
  college: string | null;
  courses: HistoricCourse[];
  semesterSummary: HistoricTermSummary | null;
  cumulativeAfterTerm: HistoricTermSummary | null;
}

export interface CurrentCourse {
  courseCode: string;
  dept: string;
  number: string;
  suffix: string | null;
  section: string;
  credits: number;
  regMethod: string;
  gradeOrStatus: string;
  addDate: string;
  dropDate: string | null;
  modifiedDate: string;
  genEds: string[];
  rawLine: string;
}

export interface CurrentTerm {
  termName: string;
  year: number;
  termLabel: string;
  courses: CurrentCourse[];
}

export interface TranscriptTransferTotals {
  totalAcceptableUGCredits: number | null;
  totalApplicableUGCredits: number | null;
}

export interface TranscriptGlobalCumulative {
  credit: number | null;
  gpa: number | null;
}

export interface TranscriptSummary {
  totalCreditsEarned: number | null;
  totalCreditsAttempted: number | null;
  totalParsedCourses: number;
  totalPassingCourses: number;
  apCredits: number;
  apEquivalencyCount: number;
  transferCourseCount: number;
  historicCourseCount: number;
  historicTermCount: number;
  currentCourseCount: number;
  totalAcceptableTransferCredits: number | null;
  totalApplicableTransferCredits: number | null;
}

export interface TranscriptParseResult {
  fileName: string;
  pageCount: number;
  rawText: string;
  fields: ParsedTranscriptFields;
  transfers: TransferInstitution[];
  historicTerms: HistoricTerm[];
  currentTerm: CurrentTerm | null;
  transferTotals: TranscriptTransferTotals;
  globalCumulative: TranscriptGlobalCumulative;
  courses: ParsedTranscriptCourse[];
  summary: TranscriptSummary;
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

type ParserState = "header" | "transfer_list" | "transfer_detail" | "history" | "current";

const EMPTY_FIELDS: ParsedTranscriptFields = {
  fullName: null,
  email: null,
  universityUid: null,
  major: null,
  degree: null,
  classStanding: null,
  degreeSeekingStatus: null,
  genEdProgram: null,
  cumulativeGpa: null,
  admitTerm: null,
  graduationYear: null,
  college: null,
  asOfDate: null,
  doubleDegrees: [],
};

const PASSING_GRADES = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "P", "S", "CR"]);
const NON_PROGRESS_GRADES = new Set(["F", "W", "WP", "WF", "I", "IP", "NG", "NC", "AUD", "NGR", "U"]);
const GRADE_PATTERN = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|CR|U|I|W|WP|WF|IP|NG|NC|AUD|NGR)$/i;
const GEN_ED_TOKEN_PATTERN = /^(FSAW|FSPW|FSOC|FSMA|FSAR|DSHS|DSHU|DSNL|DSNS|DSSP|SCIS|DVUP|DVCC)$/;
const TERM_HEADING_PATTERN = /^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/i;
const CURRENT_COURSE_PATTERN = /^([A-Z]{4})(\d{3})([A-Z]?)\s+(\d{4})\s+(\d+\.\d{2})\s+([A-Z]{3})\s+([A-Z]{1,3})\s+(\d{2}\/\d{2}\/\d{2})(?:\s+(\d{2}\/\d{2}\/\d{2}))?\s+(\d{2}\/\d{2}\/\d{2})(?:\s+(.+))?$/;

function cleanFieldValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeCourseCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normalizeTranscriptText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function splitTranscriptLines(text: string): string[] {
  return normalizeTranscriptText(text)
    .split("\n")
    .map((line) => line.replace(/\s+$/g, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^\d{1,2}\/\d{1,2}\/\d{2},\s+\d{1,2}:\d{2}\s+[AP]M/i.test(line));
}

function parseGenEdTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .replace(/\bor\b/gi, " ")
      .split(/[^A-Z]+/i)
      .map((token) => token.trim().toUpperCase())
      .filter((token) => GEN_ED_TOKEN_PATTERN.test(token)),
  ));
}

function parseNumericKeyValuePairs(line: string): Array<{ label: string; value: number }> {
  const matches: Array<{ label: string; value: number }> = [];
  const regex = /([A-Za-z][A-Za-z /().-]*?):\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const label = cleanFieldValue(match[1]);
    const value = Number(match[2]);
    if (label && Number.isFinite(value)) {
      matches.push({ label, value });
    }
  }

  return matches;
}

function parseNameEmail(lines: string[]): { fullName: string | null; email: string | null } {
  let fullName: string | null = null;
  let email: string | null = null;

  for (const line of lines.slice(0, 20)) {
    const combined = line.match(/^(.*?)(?:\s*)E-Mail:\s*([A-Z0-9._%+-]+@(?:terpmail\.)?umd\.edu)$/i);
    if (combined) {
      fullName = cleanFieldValue(combined[1]);
      email = combined[2];
      break;
    }

    const emailOnly = line.match(/^E-Mail:\s*([A-Z0-9._%+-]+@(?:terpmail\.)?umd\.edu)$/i);
    if (emailOnly) {
      email = emailOnly[1];
    }
  }

  if (!fullName) {
    const asOfIndex = lines.findIndex((line) => /^As of:/i.test(line));
    if (asOfIndex >= 0) {
      for (const candidate of lines.slice(asOfIndex + 1, asOfIndex + 6)) {
        if (/^E-Mail:/i.test(candidate)) break;
        if (/UNOFFICIAL TRANSCRIPT|FOR ADVISING PURPOSES ONLY|Office of the Registrar|College Park/i.test(candidate)) continue;
        if (/^[A-Za-z'., -]{4,80}$/.test(candidate)) {
          fullName = cleanFieldValue(candidate);
          break;
        }
      }
    }
  }

  return { fullName, email };
}

function parseHeaderFields(lines: string[]): ParsedTranscriptFields {
  const fields: ParsedTranscriptFields = { ...EMPTY_FIELDS, doubleDegrees: [] };
  const { fullName, email } = parseNameEmail(lines);
  fields.fullName = fullName;
  fields.email = email;

  for (const line of lines) {
    if (!fields.asOfDate) {
      const asOfMatch = line.match(/As of:\s*(\d{2}\/\d{2}\/\d{2})/i);
      if (asOfMatch) fields.asOfDate = asOfMatch[1];
    }

    if (!fields.universityUid) {
      const uidMatch = line.match(/(?:UID|University UID|University ID|Student ID)[:\s]+(\d{9})/i);
      if (uidMatch) fields.universityUid = uidMatch[1];
    }

    if (!fields.major) {
      const majorMatch = line.match(/^Major:\s*(.+)$/i);
      if (majorMatch) fields.major = cleanFieldValue(majorMatch[1]);
    }

    if (!fields.degree && /Double Degree:/i.test(line)) {
      fields.degree = "Double Degree";
    }

    if (/^Double Degree:/i.test(line)) {
      const doubleDegree = cleanFieldValue(line.replace(/^Double Degree:\s*/i, ""));
      if (doubleDegree && !fields.doubleDegrees.includes(doubleDegree)) {
        fields.doubleDegrees.push(doubleDegree);
      }
    }

    if (!fields.classStanding || !fields.degreeSeekingStatus) {
      const standingMatch = line.match(/^(Freshman(?:\s*-\s*First Time)?|Sophomore|Junior|Senior|Graduate)(?:\s+)(.+Degree Seeking.*)$/i);
      if (standingMatch) {
        fields.classStanding = cleanFieldValue(standingMatch[1]);
        fields.degreeSeekingStatus = cleanFieldValue(standingMatch[2]);
      }
    }

    if (!fields.genEdProgram) {
      const genEdMatch = line.match(/^GenEd Program\s+(.+)$/i);
      if (genEdMatch) fields.genEdProgram = cleanFieldValue(genEdMatch[1]);
    }

    if (!fields.cumulativeGpa) {
      const cumulativeMatch = line.match(/^UG Cumulative GPA\s*:\s*(\d\.\d{1,3})$/i)
        ?? line.match(/(?:Cumulative GPA|Overall GPA|Cum GPA)[:\s]+(\d\.\d{1,3})/i);
      if (cumulativeMatch) fields.cumulativeGpa = cumulativeMatch[1];
    }

    if (!fields.admitTerm) {
      const admitMatch = line.match(/(?:Admit Term|Matriculation Term)[^\d]*(Fall|Spring|Summer|Winter)\s+(20\d{2})/i);
      if (admitMatch) fields.admitTerm = `${admitMatch[1]} ${admitMatch[2]}`;
    }

    if (!fields.graduationYear) {
      const graduationMatch = line.match(/(?:Expected Graduation|Graduation Year|Expected Degree Date)[^\d]*(20\d{2})/i);
      if (graduationMatch) fields.graduationYear = graduationMatch[1];
    }
  }

  if (!fields.degree) {
    const allText = lines.join("\n");
    const degreeMatch = allText.match(/\b(Bachelor of Science|Bachelor of Arts|B\.\s*S\.?|B\.\s*A\.?|BS|BA)\b/i);
    fields.degree = degreeMatch ? cleanFieldValue(degreeMatch[1]) : null;
  }

  if (lines.some((line) => /^UNIVERSITY OF MARYLAND$/i.test(line)) || lines.some((line) => /^COLLEGE PARK$/i.test(line))) {
    fields.college = "University of Maryland - College Park";
  }

  return fields;
}

function isProgressGrade(grade: string | null): boolean {
  if (!grade) return true;
  const normalized = grade.toUpperCase();
  if (NON_PROGRESS_GRADES.has(normalized)) return false;
  return PASSING_GRADES.has(normalized);
}

function parseTermHeading(line: string): { termName: string; year: number; termLabel: string } | null {
  const match = line.match(TERM_HEADING_PATTERN);
  if (!match) return null;
  return {
    termName: match[1],
    year: Number(match[2]),
    termLabel: `${match[1]} ${match[2]}`,
  };
}

function parseInstitutionReceivedLine(line: string): { name: string; receivedDate: string } | null {
  const match = line.match(/^(.+?)\s+on\s+(\d{2}\/\d{2}\/\d{2})$/i);
  if (!match) return null;
  return {
    name: cleanFieldValue(match[1]) ?? match[1].trim(),
    receivedDate: match[2],
  };
}

function isTransferInstitutionHeader(line: string, institutionNames: Set<string>): boolean {
  if (institutionNames.has(line)) return true;
  if (/^Advanced Placement Exam$/i.test(line)) return true;
  if (/^International Baccalaureate/i.test(line)) return true;
  return /^[A-Z][A-Za-z&'. -]+(?:University|College|Institute|Exam)$/i.test(line);
}

function parseTransferItemLine(line: string, inheritedExternalCode: string | null): TransferItem | null {
  const match = line.match(/^(?:(\d{4})\s+)?(.+?)\s+(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|CR|U)\s+(\d+\.\d{2})(?:\s+(.+))?$/i);
  if (!match) return null;

  const externalCode = match[1] ?? inheritedExternalCode;
  const description = cleanFieldValue(match[2]) ?? line;
  const grade = match[3].toUpperCase();
  const credits = Number(match[4]);
  const tail = cleanFieldValue(match[5]) ?? "";

  const umdEquivalentCourseMatch = tail.match(/\b([A-Z]{2,5}\s?\d{3}[A-Z]?)\b/);
  const umdEquivalentCourse = umdEquivalentCourseMatch ? normalizeCourseCode(umdEquivalentCourseMatch[1]) : null;
  let notation = tail;
  if (umdEquivalentCourseMatch) {
    notation = notation.replace(umdEquivalentCourseMatch[0], " ").trim();
  }

  const genEds = parseGenEdTokens(notation);
  if (genEds.length > 0) {
    for (const genEd of genEds) {
      notation = notation.replace(new RegExp(`\\b${genEd}\\b`, "g"), " ");
    }
    notation = notation.replace(/\bor\b/gi, " ").replace(/[;,]/g, " ").replace(/\s+/g, " ").trim();
  }

  return {
    externalCode,
    description,
    grade,
    credits,
    umdEquivalentCourse,
    genEds,
    notation: notation.length > 0 ? notation : null,
    rawLine: line,
  };
}

function parseHistoricCourseLine(line: string): HistoricCourse | null {
  const match = line.match(/^([A-Z]{4})(\d{3})([A-Z]?)\s+(.+?)\s+(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|S|CR|W|WP|WF|I|IP|NG|NC|AUD|NGR)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+(.+))?$/i);
  if (!match) return null;

  return {
    courseCode: `${match[1]}${match[2]}${match[3]}`,
    dept: match[1],
    number: match[2],
    suffix: match[3] || null,
    title: cleanFieldValue(match[4]) ?? match[4],
    grade: match[5].toUpperCase(),
    creditsAttempted: Number(match[6]),
    creditsEarned: Number(match[7]),
    qualityPoints: Number(match[8]),
    genEds: parseGenEdTokens(match[9]),
    rawLine: line,
  };
}

function parseHistoricSummary(line: string): HistoricTermSummary | null {
  const values = line.match(/\d+\.\d+/g) ?? [];
  if (values.length < 4) return null;
  return {
    attempted: Number(values[0]),
    earned: Number(values[1]),
    qualityPoints: Number(values[2]),
    gpa: Number(values[3]),
  };
}

function parseCurrentCourseLine(line: string): CurrentCourse | null {
  const match = line.match(CURRENT_COURSE_PATTERN);
  if (!match) return null;

  const dropDate = match[9] ?? null;
  if (dropDate) {
    return null;
  }

  return {
    courseCode: `${match[1]}${match[2]}${match[3]}`,
    dept: match[1],
    number: match[2],
    suffix: match[3] || null,
    section: match[4],
    credits: Number(match[5]),
    regMethod: match[6],
    gradeOrStatus: match[7],
    addDate: match[8],
    dropDate,
    modifiedDate: match[10],
    genEds: parseGenEdTokens(match[11]),
    rawLine: line,
  };
}

function flattenTranscriptCourses(transfers: TransferInstitution[], historicTerms: HistoricTerm[]): ParsedTranscriptCourse[] {
  const transferCourses = transfers.flatMap((institution) => {
    const sourceType: TranscriptCourseSource = /^Advanced Placement/i.test(institution.name)
      ? "AP"
      : /^International Baccalaureate/i.test(institution.name)
        ? "IB"
        : "transfer";

    return institution.items.map((item) => ({
      sourceType,
      courseCode: item.umdEquivalentCourse,
      title: item.description,
      credits: item.credits,
      grade: item.grade,
      termLabel: "Prior to UMD",
      countsTowardProgress: item.credits > 0 && !/no credit/i.test(item.notation ?? ""),
      genEdCodes: item.genEds,
      rawLine: item.rawLine,
    } satisfies ParsedTranscriptCourse));
  });

  const historicCourses = historicTerms.flatMap((term) => (
    term.courses.map((course) => ({
      sourceType: "transcript" as const,
      courseCode: course.courseCode,
      title: course.title,
      credits: course.creditsAttempted,
      grade: course.grade,
      termLabel: term.termLabel,
      countsTowardProgress: course.creditsEarned > 0 && isProgressGrade(course.grade),
      genEdCodes: course.genEds,
      rawLine: course.rawLine,
    }))
  ));

  return [...transferCourses, ...historicCourses];
}

function buildTranscriptSummary(
  transfers: TransferInstitution[],
  historicTerms: HistoricTerm[],
  currentTerm: CurrentTerm | null,
  transferTotals: TranscriptTransferTotals,
  globalCumulative: TranscriptGlobalCumulative,
  courses: ParsedTranscriptCourse[],
): TranscriptSummary {
  const apInstitutions = transfers.filter((institution) => /^Advanced Placement/i.test(institution.name));
  const apCredits = apInstitutions.flatMap((institution) => institution.items).reduce((sum, item) => sum + item.credits, 0);
  const totalCreditsAttempted = historicTerms.at(-1)?.cumulativeAfterTerm?.attempted ?? null;

  return {
    totalCreditsEarned: globalCumulative.credit,
    totalCreditsAttempted,
    totalParsedCourses: courses.length,
    totalPassingCourses: courses.filter((course) => course.countsTowardProgress).length,
    apCredits,
    apEquivalencyCount: apInstitutions.reduce((sum, institution) => sum + institution.items.length, 0),
    transferCourseCount: transfers
      .filter((institution) => !/^Advanced Placement/i.test(institution.name) && !/^International Baccalaureate/i.test(institution.name))
      .reduce((sum, institution) => sum + institution.items.length, 0),
    historicCourseCount: historicTerms.reduce((sum, term) => sum + term.courses.length, 0),
    historicTermCount: historicTerms.length,
    currentCourseCount: currentTerm?.courses.length ?? 0,
    totalAcceptableTransferCredits: transferTotals.totalAcceptableUGCredits,
    totalApplicableTransferCredits: transferTotals.totalApplicableUGCredits,
  };
}

export function parseUnofficialTranscriptText(text: string, fileName: string = "transcript.pdf", pageCount: number = 0): TranscriptParseResult {
  const rawText = normalizeTranscriptText(text).trim();
  const lines = splitTranscriptLines(rawText);
  const fields = parseHeaderFields(lines);
  const transfers: TransferInstitution[] = [];
  const historicTerms: HistoricTerm[] = [];
  let currentTerm: CurrentTerm | null = null;
  const transferTotals: TranscriptTransferTotals = {
    totalAcceptableUGCredits: null,
    totalApplicableUGCredits: null,
  };
  const globalCumulative: TranscriptGlobalCumulative = {
    credit: null,
    gpa: fields.cumulativeGpa ? Number(fields.cumulativeGpa) : null,
  };

  const institutionDates = new Map<string, string>();
  const transferInstitutionNames = new Set<string>();
  let state: ParserState = "header";
  let currentTransferInstitution: TransferInstitution | null = null;
  let currentHistoricTerm: HistoricTerm | null = null;
  let currentTransferCode: string | null = null;

  const finalizeTransferInstitution = () => {
    if (!currentTransferInstitution) return;
    transfers.push(currentTransferInstitution);
    currentTransferInstitution = null;
    currentTransferCode = null;
  };

  const finalizeHistoricTerm = () => {
    if (!currentHistoricTerm) return;
    historicTerms.push(currentHistoricTerm);
    currentHistoricTerm = null;
  };

  for (const line of lines) {
    if (state === "header") {
      if (/^Transcripts received from the following institutions:/i.test(line)) {
        state = "transfer_list";
        continue;
      }
      if (/^\*\* Transfer Credit Information \*\*/i.test(line)) {
        state = "transfer_detail";
        continue;
      }
      if (/^Historic Course Information is listed in the order:/i.test(line)) {
        state = "history";
        continue;
      }
      continue;
    }

    if (state === "transfer_list") {
      if (/^\*\* Transfer Credit Information \*\*/i.test(line)) {
        state = "transfer_detail";
        continue;
      }
      const institution = parseInstitutionReceivedLine(line);
      if (institution) {
        institutionDates.set(institution.name, institution.receivedDate);
        transferInstitutionNames.add(institution.name);
      }
      continue;
    }

    if (state === "transfer_detail") {
      if (/^Historic Course Information is listed in the order:/i.test(line)) {
        finalizeTransferInstitution();
        state = "history";
        continue;
      }

      const numericPairs = parseNumericKeyValuePairs(line);
      if (numericPairs.length > 0) {
        const labels = new Map(numericPairs.map((entry) => [entry.label.toLowerCase(), entry.value]));
        if (labels.has("acceptable ug inst. credits") || labels.has("applicable ug inst. credits")) {
          if (currentTransferInstitution) {
            currentTransferInstitution.acceptableCredits = labels.get("acceptable ug inst. credits") ?? currentTransferInstitution.acceptableCredits;
            currentTransferInstitution.applicableCredits = labels.get("applicable ug inst. credits") ?? currentTransferInstitution.applicableCredits;
          }
          continue;
        }
        if (labels.has("total ug credits acceptable") || labels.has("total ug credits applicable")) {
          transferTotals.totalAcceptableUGCredits = labels.get("total ug credits acceptable") ?? transferTotals.totalAcceptableUGCredits;
          transferTotals.totalApplicableUGCredits = labels.get("total ug credits applicable") ?? transferTotals.totalApplicableUGCredits;
          continue;
        }
      }

      if (isTransferInstitutionHeader(line, transferInstitutionNames)) {
        finalizeTransferInstitution();
        currentTransferInstitution = {
          name: line,
          receivedDate: institutionDates.get(line) ?? null,
          items: [],
          acceptableCredits: null,
          applicableCredits: null,
        };
        continue;
      }

      if (!currentTransferInstitution) {
        continue;
      }

      const transferItem = parseTransferItemLine(line, currentTransferCode);
      if (transferItem) {
        currentTransferInstitution.items.push(transferItem);
        currentTransferCode = transferItem.externalCode;
      }
      continue;
    }

    if (state === "history") {
      if (/^\*\* Current Course Information \*\*/i.test(line)) {
        finalizeHistoricTerm();
        state = "current";
        continue;
      }

      const termHeading = parseTermHeading(line);
      if (termHeading) {
        finalizeHistoricTerm();
        currentHistoricTerm = {
          ...termHeading,
          major: null,
          college: null,
          courses: [],
          semesterSummary: null,
          cumulativeAfterTerm: null,
        };
        continue;
      }

      const numericPairs = parseNumericKeyValuePairs(line);
      if (!currentHistoricTerm) {
        for (const pair of numericPairs) {
          if (pair.label.toLowerCase() === "ug cumulative credit") {
            globalCumulative.credit = pair.value;
          }
          if (pair.label.toLowerCase() === "ug cumulative gpa") {
            globalCumulative.gpa = pair.value;
            fields.cumulativeGpa = pair.value.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "");
          }
        }
        continue;
      }

      if (/^MAJOR:/i.test(line)) {
        const majorMatch = line.match(/MAJOR:\s*(.+?)(?:\s+COLLEGE:|$)/i);
        const collegeMatch = line.match(/COLLEGE:\s*(.+)$/i);
        currentHistoricTerm.major = cleanFieldValue(majorMatch?.[1]);
        currentHistoricTerm.college = cleanFieldValue(collegeMatch?.[1]);
        continue;
      }

      if (/^Semester:/i.test(line)) {
        currentHistoricTerm.semesterSummary = parseHistoricSummary(line);
        continue;
      }

      if (/^UG Cumulative:/i.test(line)) {
        currentHistoricTerm.cumulativeAfterTerm = parseHistoricSummary(line);
        continue;
      }

      for (const pair of numericPairs) {
        if (pair.label.toLowerCase() === "ug cumulative credit") {
          globalCumulative.credit = pair.value;
        }
        if (pair.label.toLowerCase() === "ug cumulative gpa") {
          globalCumulative.gpa = pair.value;
          fields.cumulativeGpa = pair.value.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "");
        }
      }
      if (numericPairs.length > 0) {
        continue;
      }

      if (/^\*\* Semester Academic Honors \*\*/i.test(line) || /^Course, Title, Grade/i.test(line)) {
        continue;
      }

      const historicCourse = parseHistoricCourseLine(line);
      if (historicCourse) {
        currentHistoricTerm.courses.push(historicCourse);
      }
      continue;
    }

    if (state === "current") {
      if (!currentTerm) {
        const currentHeaderMatch = line.match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})\s+Course\s+Sec\s+Credits/i);
        if (currentHeaderMatch) {
          currentTerm = {
            termName: currentHeaderMatch[1],
            year: Number(currentHeaderMatch[2]),
            termLabel: `${currentHeaderMatch[1]} ${currentHeaderMatch[2]}`,
            courses: [],
          };
        }
        continue;
      }

      if (/^Meth\s*\/Add\s+Date/i.test(line) || /^=+/.test(line)) {
        continue;
      }

      const currentCourse = parseCurrentCourseLine(line);
      if (currentCourse) {
        currentTerm.courses.push(currentCourse);
      }
    }
  }

  finalizeTransferInstitution();
  finalizeHistoricTerm();

  const courses = flattenTranscriptCourses(transfers, historicTerms);
  const summary = buildTranscriptSummary(transfers, historicTerms, currentTerm, transferTotals, globalCumulative, courses);

  return {
    fileName,
    pageCount,
    rawText,
    fields,
    transfers,
    historicTerms,
    currentTerm,
    transferTotals,
    globalCumulative,
    courses,
    summary,
  };
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
        lines.push(currentLine.join(" ").replace(/\s+$/g, ""));
      }
      currentY = item.y;
      currentLine = [];
    }
    if (item.str) {
      currentLine.push(item.str);
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(" ").replace(/\s+$/g, ""));
  }

  return lines.join("\n");
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
