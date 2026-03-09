/*
  OrbitUMD catalog sync worker (starter implementation)

  Purpose:
  - Pull catalog data from Jupiter + UMD + PlanetTerp
  - Merge into canonical rows
  - Upsert into Postgres tables from data-sync/schema.postgres.sql

  This is intentionally dependency-light and includes TODO markers where DB code
  should be connected (e.g., pg Pool). It can be evolved into a production worker.
*/

import crypto from "node:crypto";

const TERM_CODE_BY_LABEL = {
  Winter: "12",
  Spring: "01",
  Summer: "05",
  Fall: "08",
};

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((entry) => {
      const [key, value] = entry.split("=");
      return [key.replace(/^--/, ""), value ?? "true"];
    })
  );

  const term = args.term ?? "Fall";
  const year = Number(args.year ?? new Date().getFullYear());
  if (!TERM_CODE_BY_LABEL[term]) {
    throw new Error(`Unsupported --term value: ${term}`);
  }
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid --year value: ${args.year}`);
  }

  return {
    dryRun: args["dry-run"] === "true",
    termLabel: term,
    termCode: TERM_CODE_BY_LABEL[term],
    year,
  };
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.json();
}

async function fetchJupiterCatalog({ jupiterBase, termCode, year }) {
  if (!jupiterBase) return [];
  const url = new URL("/v0/courses/withSections", jupiterBase);
  url.searchParams.set("term", termCode);
  url.searchParams.set("year", String(year));
  url.searchParams.set("limit", "500");
  url.searchParams.set("offset", "0");
  return getJson(url.toString());
}

async function fetchUmdCatalog({ umdBase, termCode, year }) {
  const url = new URL("courses", umdBase.endsWith("/") ? umdBase : `${umdBase}/`);
  url.searchParams.set("semester", `${year}${termCode}`);
  url.searchParams.set("per_page", "200");
  url.searchParams.set("page", "1");
  return getJson(url.toString());
}

function normalizeCourseRow(raw, termCode, year) {
  const courseCode = String(raw.courseCode ?? raw.course_id ?? "").trim().toUpperCase();
  const name = String(raw.name ?? raw.title ?? courseCode).trim();
  return {
    course_code: courseCode,
    term_code: termCode,
    year,
    name,
    dept_id: String(raw.deptId ?? raw.dept_id ?? courseCode.slice(0, 4) ?? "").trim() || null,
    description: raw.description ?? null,
    source_fingerprint: sha(JSON.stringify(raw)),
  };
}

function mergeByCourseCode(jupiterRows, umdRows, termCode, year) {
  const map = new Map();

  for (const row of umdRows) {
    const normalized = normalizeCourseRow(row, termCode, year);
    map.set(normalized.course_code, normalized);
  }

  for (const row of jupiterRows) {
    const normalized = normalizeCourseRow(row, termCode, year);
    const existing = map.get(normalized.course_code);
    map.set(normalized.course_code, {
      ...existing,
      ...normalized,
      canonical_source: "jupiter",
    });
  }

  return Array.from(map.values());
}

async function upsertCatalogRows(rows, { dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] would upsert ${rows.length} course rows`);
    return;
  }

  // TODO: wire DB client (pg) and upsert into orbit.courses and related tables.
  // Recommended:
  // 1) insert into orbit.sync_runs(status='running') returning id
  // 2) upsert courses in transaction
  // 3) upsert sections + meetings + instructors
  // 4) update sync_runs status + summary
  console.log(`TODO: connect to DB and upsert ${rows.length} rows`);
}

async function main() {
  const args = parseArgs();
  const jupiterBase = process.env.JUPITER_BASE_URL;
  const umdBase = process.env.UMD_BASE_URL ?? "https://api.umd.io/v1";

  const [jupiterRows, umdRows] = await Promise.all([
    fetchJupiterCatalog({ jupiterBase, termCode: args.termCode, year: args.year }).catch(() => []),
    fetchUmdCatalog({ umdBase, termCode: args.termCode, year: args.year }).catch(() => []),
  ]);

  const merged = mergeByCourseCode(jupiterRows, umdRows, args.termCode, args.year);
  await upsertCatalogRows(merged, args);

  console.log(`sync complete: ${args.termLabel} ${args.year}, merged rows=${merged.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
