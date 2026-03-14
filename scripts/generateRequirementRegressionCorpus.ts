import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  discoverProgramRequirementUrls,
  scrapeProgramRequirements,
  type ParsedDslNode,
  type ParsedProgram,
} from "../catalog-scraper/scrapeProgramRequirements";

interface CrawlFailure {
  url: string;
  reason: string;
}

interface CorpusManifest {
  generatedAt: string;
  totalDiscovered: number;
  totalParsed: number;
  totalFailed: number;
  outputDir: string;
  programs: Array<{
    code: string;
    title: string;
    url: string;
    file: string;
    rootNodeCount: number;
    blockCount: number;
    itemCount: number;
    diagnostics: ParsedProgram["diagnostics"];
    quality: ProgramQualitySummary;
  }>;
  failures: CrawlFailure[];
}

interface RetryConfig {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface ProgramQualitySummary {
  score: number;
  totalNodes: number;
  structuralNodes: number;
  noteNodes: number;
  courseNodes: number;
  courseGroupNodes: number;
  choiceNodes: number;
  quantifiedRuleNodes: number;
  actionableStructuralNodes: number;
  signals: {
    mentionsCredits: boolean;
    mentionsSelection: boolean;
    hasCourseCode: boolean;
    hasListStructure: boolean;
    hasTableStructure: boolean;
  };
  fallbackUsed: boolean;
  fallbackOnlyNotesWithSignals: boolean;
  enforceMinScore: boolean;
}

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function parseIntArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number, config: RetryConfig): number {
  const expDelay = Math.min(config.maxDelayMs, config.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(expDelay * 0.2)));
  return expDelay + jitter;
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|timed out|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|HTTP 429|HTTP 5\d\d/i.test(message);
}

async function scrapeWithRetry(url: string, retryConfig: RetryConfig): Promise<ParsedProgram | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retryConfig.attempts; attempt += 1) {
    try {
      return await scrapeProgramRequirements(url);
    } catch (error) {
      lastError = error;
      if (attempt >= retryConfig.attempts || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = getBackoffDelay(attempt, retryConfig);
      console.log(`[corpus] retry ${attempt}/${retryConfig.attempts - 1} after ${delayMs}ms for ${url}`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function writeProgramFile(programsDir: string, parsed: ParsedProgram): Promise<string> {
  const fileName = `${safeFileSegment(parsed.code)}.json`;
  const absolutePath = path.join(programsDir, fileName);

  const payload = {
    code: parsed.code,
    title: parsed.title,
    college: parsed.college,
    degreeType: parsed.degreeType,
    sourceUrl: parsed.sourceUrl,
    catalogYearStart: parsed.catalogYearStart,
    minCredits: parsed.minCredits,
    rootNodes: parsed.rootNodes,
    diagnostics: parsed.diagnostics,
    flattened: {
      blocks: parsed.blocks,
      items: parsed.items,
    },
  };

  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return fileName;
}

function collectNodeStats(
  rootNodes: ParsedDslNode[],
): Omit<ProgramQualitySummary, "score" | "signals" | "fallbackUsed" | "fallbackOnlyNotesWithSignals" | "enforceMinScore"> {
  let totalNodes = 0;
  let structuralNodes = 0;
  let noteNodes = 0;
  let courseNodes = 0;
  let courseGroupNodes = 0;
  let choiceNodes = 0;
  let quantifiedRuleNodes = 0;
  let actionableStructuralNodes = 0;

  const isActionableRequireAllLeaf = (node: ParsedDslNode): boolean => {
    if (node.nodeType !== "requireAll") return false;
    if (node.children.length > 0) return false;
    return /\b(credit|credits|course|courses|field|fields|semester|semesters|select|choose|complete|take|required|must)\b/i.test(
      node.label,
    );
  };

  const visit = (node: ParsedDslNode): void => {
    totalNodes += 1;
    if (node.nodeType === "note") {
      noteNodes += 1;
    } else {
      structuralNodes += 1;
      if (node.nodeType === "course") courseNodes += 1;
      if (node.nodeType === "courseGroup") courseGroupNodes += 1;
      if (node.nodeType === "requireAny") choiceNodes += 1;
      if (typeof node.minCount === "number" || typeof node.minCredits === "number") quantifiedRuleNodes += 1;
      if (
        node.nodeType === "course" ||
        node.nodeType === "courseGroup" ||
        node.nodeType === "requireAny" ||
        typeof node.minCount === "number" ||
        typeof node.minCredits === "number" ||
        isActionableRequireAllLeaf(node)
      ) {
        actionableStructuralNodes += 1;
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const rootNode of rootNodes) {
    visit(rootNode);
  }

  return {
    totalNodes,
    structuralNodes,
    noteNodes,
    courseNodes,
    courseGroupNodes,
    choiceNodes,
    quantifiedRuleNodes,
    actionableStructuralNodes,
  };
}

function summarizeQuality(parsed: ParsedProgram): ProgramQualitySummary {
  const stats = collectNodeStats(parsed.rootNodes);
  const allText = JSON.stringify(parsed.rootNodes);
  const hasCourseCode = /\b[A-Z]{2,6}\s*\d{3}[A-Z]?\b/i.test(allText);
  const signals = {
    mentionsCredits:
      parsed.minCredits !== null ||
      /\b\d+\s*credits?\b|\bminimum\s+of\s+\d+\s+credits\b|\b\d+\s*-\s*\d+\s*credits\b/i.test(allText),
    mentionsSelection: /\bselect|choose|complete|take\b/i.test(allText),
    hasCourseCode,
    hasListStructure: parsed.diagnostics.listCount > 0,
    hasTableStructure: parsed.diagnostics.tableCount > 0,
  };
  const fallbackUsed = parsed.diagnostics.parseMode === "non-table";
  const fallbackOnlyNotesWithSignals = fallbackUsed && (signals.mentionsCredits || signals.mentionsSelection) && stats.actionableStructuralNodes === 0;
  const structuralRatio = stats.totalNodes === 0 ? 0 : stats.structuralNodes / stats.totalNodes;
  const actionableRatio = stats.totalNodes === 0 ? 0 : stats.actionableStructuralNodes / stats.totalNodes;
  const quantifiedBoost = Math.min(0.2, stats.quantifiedRuleNodes * 0.04);
  const courseBoost = Math.min(0.15, (stats.courseNodes + stats.courseGroupNodes + stats.choiceNodes) * 0.02);
  const score = Number(Math.min(1, structuralRatio * 0.35 + actionableRatio * 0.45 + quantifiedBoost + courseBoost).toFixed(3));

  const hasStrongRequirementSignal =
    signals.mentionsCredits ||
    signals.mentionsSelection ||
    signals.hasCourseCode ||
    stats.choiceNodes > 0 ||
    stats.quantifiedRuleNodes > 0 ||
    (signals.hasTableStructure && stats.courseNodes > 0);

  const enforceMinScore = hasStrongRequirementSignal;

  return {
    ...stats,
    score,
    signals,
    fallbackUsed,
    fallbackOnlyNotesWithSignals,
    enforceMinScore,
  };
}

async function main(): Promise<void> {
  const maxPrograms = parseIntArg("--max-programs", 0);
  const outputArg = getArg("--output-dir");
  const retryAttempts = parseIntArg("--fetch-retries", 3);
  const retryBaseDelayMs = parseIntArg("--fetch-retry-base-ms", 600);
  const retryMaxDelayMs = parseIntArg("--fetch-retry-max-ms", 6000);
  const minQualityScoreArg = getArg("--min-quality-score");
  const minQualityScore = minQualityScoreArg ? Number.parseFloat(minQualityScoreArg) : 0;
  const strictFallbackMode = hasArg("--strict-fallback-mode");
  const stamp = new Date().toISOString().slice(0, 10);
  const outputDir = path.resolve(outputArg ?? path.join("catalog-scraper", "regression-corpus", stamp));
  const programsDir = path.join(outputDir, "programs");

  await ensureDir(programsDir);

  const urls = await discoverProgramRequirementUrls(maxPrograms);
  console.log(`[corpus] discovered ${urls.length} major/minor URLs`);

  const manifest: CorpusManifest = {
    generatedAt: new Date().toISOString(),
    totalDiscovered: urls.length,
    totalParsed: 0,
    totalFailed: 0,
    outputDir,
    programs: [],
    failures: [],
  };

  const retryConfig: RetryConfig = {
    attempts: retryAttempts,
    baseDelayMs: retryBaseDelayMs,
    maxDelayMs: retryMaxDelayMs,
  };

  for (const [index, url] of urls.entries()) {
    console.log(`[corpus] (${index + 1}/${urls.length}) ${url}`);
    try {
      const parsed = await scrapeWithRetry(url, retryConfig);
      if (!parsed) {
        manifest.totalFailed += 1;
        manifest.failures.push({ url, reason: "Parser returned null" });
        continue;
      }

      const quality = summarizeQuality(parsed);
      if (strictFallbackMode && quality.fallbackOnlyNotesWithSignals) {
        manifest.totalFailed += 1;
        manifest.failures.push({
          url,
          reason: `Strict fallback quality failure: fallback emitted no actionable structural nodes despite credit/selection signals (score=${quality.score})`,
        });
        continue;
      }

      if (quality.enforceMinScore && quality.score < minQualityScore) {
        manifest.totalFailed += 1;
        manifest.failures.push({
          url,
          reason: `Quality gate failure: score ${quality.score} below minimum ${minQualityScore.toFixed(3)}`,
        });
        continue;
      }

      const fileName = await writeProgramFile(programsDir, parsed);
      manifest.totalParsed += 1;
      manifest.programs.push({
        code: parsed.code,
        title: parsed.title,
        url,
        file: path.posix.join("programs", fileName),
        rootNodeCount: parsed.rootNodes.length,
        blockCount: parsed.blocks.length,
        itemCount: parsed.items.length,
        diagnostics: parsed.diagnostics,
        quality,
      });
    } catch (error) {
      manifest.totalFailed += 1;
      manifest.failures.push({
        url,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("[corpus] complete");
  console.log(`[corpus] output: ${outputDir}`);
  console.log(
    `[corpus] parsed=${manifest.totalParsed} failed=${manifest.totalFailed} discovered=${manifest.totalDiscovered}`,
  );
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[corpus] fatal: ${msg}`);
  process.exit(1);
});
