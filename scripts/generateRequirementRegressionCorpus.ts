import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  discoverProgramRequirementUrls,
  scrapeProgramRequirements,
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
  }>;
  failures: CrawlFailure[];
}

interface RetryConfig {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
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
    flattened: {
      blocks: parsed.blocks,
      items: parsed.items,
    },
  };

  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return fileName;
}

async function main(): Promise<void> {
  const maxPrograms = parseIntArg("--max-programs", 0);
  const outputArg = getArg("--output-dir");
  const retryAttempts = parseIntArg("--fetch-retries", 3);
  const retryBaseDelayMs = parseIntArg("--fetch-retry-base-ms", 600);
  const retryMaxDelayMs = parseIntArg("--fetch-retry-max-ms", 6000);
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
