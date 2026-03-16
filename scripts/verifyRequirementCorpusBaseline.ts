import fs from "node:fs/promises";
import path from "node:path";

interface CorpusProgramSummary {
  code: string;
  file: string;
  rootNodeCount: number;
  blockCount: number;
  itemCount: number;
}

interface CorpusManifest {
  generatedAt: string;
  totalDiscovered: number;
  totalParsed: number;
  totalFailed: number;
  outputDir: string;
  programs: CorpusProgramSummary[];
  failures: Array<{ url: string; reason: string }>;
}

interface StrictAllowlist {
  entries?: Array<{ url: string }>;
}

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
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
      console.log(`[corpus:verify] using latest available manifest: ${folder}`);
      return candidate;
    } catch {
      // Keep scanning.
    }
  }

  throw new Error(`No manifest.json found in ${corpusRoot}`);
}

async function loadManifest(filePath: string): Promise<CorpusManifest> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as CorpusManifest;
}

function diffCodes(reference: CorpusProgramSummary[], candidate: CorpusProgramSummary[]): {
  missing: string[];
  added: string[];
} {
  const refSet = new Set(reference.map((p) => p.code));
  const candSet = new Set(candidate.map((p) => p.code));

  const missing = [...refSet].filter((code) => !candSet.has(code)).sort();
  const added = [...candSet].filter((code) => !refSet.has(code)).sort();
  return { missing, added };
}

async function loadAllowlistUrls(filePath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as StrictAllowlist;
    return new Set((parsed.entries ?? []).map((entry) => String(entry.url ?? "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function main(): Promise<void> {
  const baselinePath = path.resolve(
    getArg("--baseline") ?? path.join("catalog-scraper", "regression-corpus", "baseline-manifest.json"),
  );
  const currentArg = getArg("--current");
  const currentPath = currentArg
    ? path.resolve(currentArg)
    : await findLatestCorpusManifestPath();
  const allowlistPath = path.resolve(
    getArg("--allowlist") ?? path.join("catalog-scraper", "regression-corpus", "strict-allowlist.json"),
  );

  const [baseline, current, allowlistUrls] = await Promise.all([
    loadManifest(baselinePath),
    loadManifest(currentPath),
    loadAllowlistUrls(allowlistPath),
  ]);

  const baselineProgramsForGuard = baseline.programs.filter((program: any) => !allowlistUrls.has(String(program.url ?? "")));
  const baselineAllowlistedCount = baseline.programs.length - baselineProgramsForGuard.length;
  const codeDiff = diffCodes(baselineProgramsForGuard, current.programs);
  const adjustedCurrentFailed = (current.failures ?? []).filter((failure) => !allowlistUrls.has(String(failure.url ?? ""))).length;
  const adjustedBaselineFailed = Math.max(0, baseline.totalFailed - baselineAllowlistedCount);
  const adjustedParsedCurrent = current.totalParsed + baselineAllowlistedCount;

  const checks: Array<{ ok: boolean; message: string }> = [
    {
      ok: adjustedCurrentFailed <= adjustedBaselineFailed,
      message: `totalFailed (non-allowlisted) ${adjustedCurrentFailed} should be <= baseline ${adjustedBaselineFailed}`,
    },
    {
      ok: adjustedParsedCurrent >= baseline.totalParsed,
      message: `totalParsed (plus allowlisted baseline pages) ${adjustedParsedCurrent} should be >= baseline ${baseline.totalParsed}`,
    },
    {
      ok: codeDiff.missing.length === 0,
      message: `missing ${codeDiff.missing.length} non-allowlisted baseline program codes in current manifest`,
    },
  ];

  let failed = false;
  for (const check of checks) {
    const state = check.ok ? "PASS" : "FAIL";
    console.log(`[corpus:verify] ${state} ${check.message}`);
    if (!check.ok) failed = true;
  }

  if (codeDiff.missing.length > 0) {
    console.log(`[corpus:verify] missing codes: ${codeDiff.missing.join(", ")}`);
  }

  if (codeDiff.added.length > 0) {
    console.log(`[corpus:verify] new codes (not in baseline): ${codeDiff.added.join(", ")}`);
  }

  if (failed) {
    process.exit(1);
  }

  console.log("[corpus:verify] baseline verification passed");
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[corpus:verify] fatal: ${msg}`);
  process.exit(1);
});
