/**
 * checkCorpusQuality.ts
 *
 * Validates the committed corpus manifest against class-specific quality thresholds.
 * Reads strict-allowlist.json to skip enforcement for known informational-only pages.
 *
 * Run via: npm run corpus:quality:check
 * Exit code 1 if any programs fail their class threshold.
 */
import fs from "node:fs/promises";
import path from "node:path";

interface ProgramQualitySummary {
  parseClass?: "table-backed" | "list-backed" | "informational-only";
  score: number;
  enforceMinScore: boolean;
}

interface ManifestProgram {
  code: string;
  title: string;
  url: string;
  quality: ProgramQualitySummary;
}

interface CorpusManifest {
  totalParsed: number;
  totalFailed: number;
  programs: ManifestProgram[];
  failures: Array<{ url: string; reason: string }>;
}

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
}

function parseFloatArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function findLatestCorpusManifestPath(): Promise<string> {
  const corpusRoot = path.resolve(path.join("catalog-scraper", "regression-corpus"));
  const todayFolder = new Date().toISOString().slice(0, 10);
  const todayManifest = path.join(corpusRoot, todayFolder, "manifest.json");

  try {
    await fs.access(todayManifest);
    return todayManifest;
  } catch {
    // Fall back to latest available dated folder below.
  }

  const entries = await fs.readdir(corpusRoot, { withFileTypes: true });
  const datedFolders = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const folder of datedFolders) {
    const candidate = path.join(corpusRoot, folder, "manifest.json");
    try {
      await fs.access(candidate);
      console.log(`[quality-check] using latest available manifest: ${folder}`);
      return candidate;
    } catch {
      // Keep scanning.
    }
  }

  throw new Error(`No manifest.json found in ${corpusRoot}`);
}

async function main(): Promise<void> {
  const manifestArg = getArg("--manifest");
  const manifestPath = manifestArg
    ? path.resolve(manifestArg)
    : await findLatestCorpusManifestPath();
  const allowlistPath = path.resolve(
    getArg("--allowlist") ?? path.join("catalog-scraper", "regression-corpus", "strict-allowlist.json"),
  );
  const minScore = parseFloatArg("--min-quality-score", 0.15);

  // Class-specific thresholds mirroring the corpus generator.
  const classThresholds: Record<string, number> = {
    "table-backed": minScore,
    "list-backed": minScore * 0.65,
    "informational-only": 0,
  };

  const [manifest, allowlist] = await Promise.all([
    fs.readFile(manifestPath, "utf8").then((raw) => JSON.parse(raw) as CorpusManifest),
    fs
      .readFile(allowlistPath, "utf8")
      .then((raw) => JSON.parse(raw) as { entries?: Array<{ url: string }> })
      .catch(() => ({ entries: [] as Array<{ url: string }> })),
  ]);

  const allowedUrls = new Set((allowlist.entries ?? []).map((e) => e.url).filter(Boolean));

  console.log(`[quality-check] manifest: ${manifest.programs.length} programs, ${manifest.totalFailed} generator failures`);
  console.log(`[quality-check] allowlist: ${allowedUrls.size} exempt URLs`);
  console.log(`[quality-check] thresholds: table-backed=${minScore}, list-backed=${(minScore * 0.65).toFixed(3)}, informational-only=0`);

  const failures: Array<{ url: string; reason: string }> = [];

  for (const program of manifest.programs) {
    if (allowedUrls.has(program.url)) continue;

    const quality = program.quality;
    if (!quality?.enforceMinScore) continue;

    const parseClass = quality.parseClass ?? "table-backed";
    const threshold = classThresholds[parseClass] ?? minScore;
    if (quality.score < threshold) {
      failures.push({
        url: program.url,
        reason: `score ${quality.score} < ${threshold.toFixed(3)} (class=${parseClass})`,
      });
    }
  }

  if (failures.length > 0) {
    console.error(`[quality-check] FAIL: ${failures.length} program(s) below class-specific quality thresholds`);
    for (const f of failures) {
      console.error(`  ✗  ${f.url}`);
      console.error(`     ${f.reason}`);
    }
    console.error(
      `\nTo exempt a page, add its URL to catalog-scraper/regression-corpus/strict-allowlist.json with a justification.`,
    );
    process.exit(1);
  }

  console.log(`[quality-check] PASS: all ${manifest.programs.length} programs meet class-specific quality thresholds`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[quality-check] fatal: ${msg}`);
  process.exit(1);
});
