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

  for (const [index, url] of urls.entries()) {
    console.log(`[corpus] (${index + 1}/${urls.length}) ${url}`);
    try {
      const parsed = await scrapeProgramRequirements(url);
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
