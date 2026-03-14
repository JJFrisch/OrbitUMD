import "dotenv/config";
import { Pool } from "pg";
import {
  discoverProgramRequirementUrls,
  scrapeProgramRequirements,
  type ParsedProgram,
} from "../catalog-scraper/scrapeProgramRequirements";

interface IngestStats {
  discoveredPrograms: number;
  skippedPrograms: number;
  insertedPrograms: number;
  insertedBlocks: number;
  insertedItems: number;
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

async function alreadyIngested(pool: Pool, program: ParsedProgram): Promise<boolean> {
  const byUrl = await pool.query<{ id: string }>(
    `select id from public.programs where source_url = $1 limit 1`,
    [program.sourceUrl],
  );
  if (byUrl.rowCount > 0) return true;

  const byCode = await pool.query<{ id: string }>(
    `select id from public.programs where code = $1 limit 1`,
    [program.code],
  );
  return byCode.rowCount > 0;
}

async function insertProgram(pool: Pool, program: ParsedProgram): Promise<{ programId: string; blockMap: Map<string, string> }> {
  const programResult = await pool.query<{ id: string }>(
    `insert into public.programs
      (code, title, college, degree_type, catalog_year_start, catalog_year_end, min_credits, source_url, requirement_tree)
     values ($1, $2, $3, $4, $5, null, $6, $7, $8::jsonb)
     returning id`,
    [
      program.code,
      program.title,
      program.college,
      program.degreeType,
      program.catalogYearStart,
      program.minCredits,
      program.sourceUrl,
      JSON.stringify(program.rootNodes),
    ],
  );

  const programId = programResult.rows[0]?.id;
  if (!programId) {
    throw new Error(`Failed to insert program ${program.title}`);
  }

  const blockMap = new Map<string, string>();

  const sortedBlocks = [...program.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const block of sortedBlocks) {
    const parentId = block.parentTempId ? blockMap.get(block.parentTempId) ?? null : null;

    const blockResult = await pool.query<{ id: string }>(
      `insert into public.requirement_blocks
        (program_id, parent_requirement_id, source_node_id, type, params, human_label, sort_order, source_note, source_url)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       returning id`,
      [
        programId,
        parentId,
        block.sourceNodeId,
        block.type,
        JSON.stringify(block.params),
        block.humanLabel,
        block.sortOrder,
        block.sourceNote ?? null,
        block.sourceUrl ?? program.sourceUrl,
      ],
    );

    const blockId = blockResult.rows[0]?.id;
    if (!blockId) {
      throw new Error(`Failed to insert requirement block ${block.humanLabel}`);
    }

    blockMap.set(block.tempId, blockId);
  }

  const sortedItems = [...program.items].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const item of sortedItems) {
    const blockId = blockMap.get(item.blockTempId);
    if (!blockId) continue;

    await pool.query(
      `insert into public.requirement_items
        (requirement_block_id, item_type, payload, sort_order)
       values ($1, $2, $3::jsonb, $4)`,
      [blockId, item.itemType, JSON.stringify(item.payload), item.sortOrder],
    );
  }

  return { programId, blockMap };
}

async function ingestOne(pool: Pool, url: string, stats: IngestStats): Promise<void> {
  const parsed = await scrapeProgramRequirements(url);
  if (!parsed) {
    stats.skippedPrograms += 1;
    return;
  }

  if (await alreadyIngested(pool, parsed)) {
    stats.skippedPrograms += 1;
    return;
  }

  await pool.query("begin");
  try {
    await insertProgram(pool, parsed);
    await pool.query("commit");

    stats.insertedPrograms += 1;
    stats.insertedBlocks += parsed.blocks.length;
    stats.insertedItems += parsed.items.length;
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  const maxPrograms = parseIntArg("--max-programs", 0);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const stats: IngestStats = {
    discoveredPrograms: 0,
    skippedPrograms: 0,
    insertedPrograms: 0,
    insertedBlocks: 0,
    insertedItems: 0,
  };

  const urls = await discoverProgramRequirementUrls(maxPrograms);
  stats.discoveredPrograms = urls.length;

  console.log(`[ingest] discovered ${urls.length} candidate program URLs`);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    for (const [index, url] of urls.entries()) {
      console.log(`[ingest] (${index + 1}/${urls.length}) ${url}`);
      try {
        await ingestOne(pool, url, stats);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[ingest] warning: failed ${url} :: ${msg}`);
      }
    }
  } finally {
    await pool.end();
  }

  console.log("[ingest] complete");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[ingest] fatal: ${msg}`);
  process.exit(1);
});
