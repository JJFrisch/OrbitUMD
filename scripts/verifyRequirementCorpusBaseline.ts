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

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
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

async function main(): Promise<void> {
  const baselinePath = path.resolve(
    getArg("--baseline") ?? path.join("catalog-scraper", "regression-corpus", "baseline-manifest.json"),
  );
  const currentPath = path.resolve(
    getArg("--current") ?? path.join("catalog-scraper", "regression-corpus", new Date().toISOString().slice(0, 10), "manifest.json"),
  );

  const [baseline, current] = await Promise.all([loadManifest(baselinePath), loadManifest(currentPath)]);
  const codeDiff = diffCodes(baseline.programs, current.programs);

  const checks: Array<{ ok: boolean; message: string }> = [
    {
      ok: current.totalFailed <= baseline.totalFailed,
      message: `totalFailed ${current.totalFailed} should be <= baseline ${baseline.totalFailed}`,
    },
    {
      ok: current.totalParsed >= baseline.totalParsed,
      message: `totalParsed ${current.totalParsed} should be >= baseline ${baseline.totalParsed}`,
    },
    {
      ok: codeDiff.missing.length === 0,
      message: `missing ${codeDiff.missing.length} baseline program codes in current manifest`,
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
