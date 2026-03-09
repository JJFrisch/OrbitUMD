import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const TERM_CODE_BY_LABEL = {
  Winter: "12",
  Spring: "01",
  Summer: "05",
  Fall: "08",
};

function parseArgs() {
  const rawArgs = Object.fromEntries(
    process.argv.slice(2).map((entry) => {
      const [key, value] = entry.split("=");
      return [key.replace(/^--/, ""), value ?? "true"];
    })
  );

  const termLabel = rawArgs.term ?? "Fall";
  const year = Number(rawArgs.year ?? new Date().getFullYear());
  const batchSize = Number(rawArgs["section-batch-size"] ?? 12);

  if (!TERM_CODE_BY_LABEL[termLabel]) {
    throw new Error(`Unsupported --term value: ${termLabel}`);
  }
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid --year value: ${rawArgs.year}`);
  }
  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error(`Invalid --section-batch-size value: ${rawArgs["section-batch-size"]}`);
  }

  return {
    termLabel,
    termCode: TERM_CODE_BY_LABEL[termLabel],
    year,
    batchSize,
    dryRun: rawArgs["dry-run"] === "true",
    trigger: rawArgs.trigger === "scheduled" ? "scheduled" : "manual",
    forceFull: rawArgs["force-full"] === "true",
    incremental: rawArgs.incremental !== "false",
  };
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitizeString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function dedupeStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const clean = sanitizeString(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function parseCredits(raw) {
  const text = sanitizeString(raw);
  if (!text) {
    return { min: null, max: null, value: null };
  }

  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return { min: direct, max: direct, value: direct };
  }

  const [left, right] = text.split("-").map((entry) => Number(entry.trim()));
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return { min: left, max: right, value: right };
  }

  return { min: null, max: null, value: null };
}

function toTermLabel(termCode, year) {
  const byCode = {
    "12": "Winter",
    "01": "Spring",
    "05": "Summer",
    "08": "Fall",
  };
  return `${byCode[termCode] ?? "Term"} ${year}`;
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
  const limit = 500;
  const all = [];

  for (let offset = 0; ; offset += limit) {
    const url = new URL("/v0/courses/withSections", jupiterBase);
    url.searchParams.set("term", termCode);
    url.searchParams.set("year", String(year));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const rows = await getJson(url.toString());
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < limit) break;
  }

  return all;
}

async function fetchUmdCatalog({ umdBase, termCode, year }) {
  const all = [];

  for (let page = 1; ; page += 1) {
    const url = new URL("courses", umdBase.endsWith("/") ? umdBase : `${umdBase}/`);
    url.searchParams.set("semester", `${year}${termCode}`);
    url.searchParams.set("per_page", "200");
    url.searchParams.set("page", String(page));
    const rows = await getJson(url.toString());
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 200) break;
  }

  return all;
}

async function fetchUmdSectionsForCourse({ umdBase, courseCode, termCode, year }) {
  const url = new URL("courses/sections", umdBase.endsWith("/") ? umdBase : `${umdBase}/`);
  url.searchParams.set("semester", `${year}${termCode}`);
  url.searchParams.set("course_id", courseCode);
  const rows = await getJson(url.toString());
  return Array.isArray(rows) ? rows : [];
}

async function fetchPlanetTerpProfessors({ planetterpBase }) {
  const limit = 500;
  const all = [];

  for (let offset = 0; ; offset += limit) {
    const url = new URL("professors", planetterpBase.endsWith("/") ? planetterpBase : `${planetterpBase}/`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const raw = await getJson(url.toString());
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < limit) break;
  }

  return all;
}

function normalizeCourseRow(raw, termCode, year) {
  const courseCode = String(raw.courseCode ?? raw.course_id ?? "").trim().toUpperCase();
  const name = String(raw.name ?? raw.title ?? courseCode).trim();
  const parsedCredits = parseCredits(raw.credits);
  const minCredits = Number(raw.minCredits ?? raw.min_credits);
  const maxCredits = Number(raw.maxCredits ?? raw.max_credits);
  const geneds = dedupeStrings(Array.isArray(raw.genEds) ? raw.genEds : Array.isArray(raw.gen_ed) ? raw.gen_ed.flat() : []);

  return {
    course_code: courseCode,
    term_code: termCode,
    year,
    name,
    dept_id: String(raw.deptId ?? raw.dept_id ?? courseCode.slice(0, 4) ?? "").trim() || null,
    min_credits: Number.isFinite(minCredits) ? minCredits : parsedCredits.min,
    max_credits: Number.isFinite(maxCredits) ? maxCredits : parsedCredits.max,
    credits: Number.isFinite(maxCredits) ? maxCredits : parsedCredits.value,
    description: raw.description ?? null,
    geneds,
    conditions: raw.conditions ?? null,
    source_fingerprint: sha(JSON.stringify(raw)),
  };
}

function normalizeMeeting(raw) {
  const days = sanitizeString(raw.days) ?? "TBA";
  const startTime = sanitizeString(raw.startTime ?? raw.start_time);
  const endTime = sanitizeString(raw.endTime ?? raw.end_time);
  const building = sanitizeString(raw.building);
  const room = sanitizeString(raw.room);
  const location = sanitizeString(raw.location ?? [building, room].filter(Boolean).join(" "));
  const classtype = sanitizeString(raw.classtype ?? raw.meeting_type);

  return {
    days,
    start_time: startTime,
    end_time: endTime,
    building,
    room,
    location,
    classtype,
  };
}

function normalizeSection(raw, termCode, year, courseCodeOverride) {
  const courseCode = String(courseCodeOverride ?? raw.courseCode ?? raw.course_id ?? raw.course ?? "").trim().toUpperCase();
  const sectionCode = String(raw.sectionCode ?? raw.number ?? raw.section_id ?? "").trim() || "TBA";
  const instructors = dedupeStrings(Array.isArray(raw.instructors) ? raw.instructors : [raw.instructor]);
  const openSeats = Number(raw.openSeats ?? raw.open_seats);
  const totalSeats = Number(raw.totalSeats ?? raw.seats);
  const waitlist = Number(raw.waitlist);
  const holdfile = Number(raw.holdfile);
  const meetingsRaw = Array.isArray(raw.meetings) ? raw.meetings : [];

  return {
    section_key: `${courseCode}::${sectionCode}`,
    course_code: courseCode,
    section_code: sectionCode,
    term_code: termCode,
    year,
    instructor: instructors.join(", ") || null,
    instructors,
    total_seats: Number.isFinite(totalSeats) ? totalSeats : null,
    open_seats: Number.isFinite(openSeats) ? openSeats : null,
    waitlist: Number.isFinite(waitlist) ? waitlist : null,
    holdfile: Number.isFinite(holdfile) ? holdfile : null,
    source_updated_at: sanitizeString(raw.updatedAt ?? raw.updated_at),
    meetings: meetingsRaw.map(normalizeMeeting),
  };
}

function mergeByCourseCode(jupiterRows, umdRows, termCode, year) {
  const map = new Map();

  for (const row of umdRows) {
    const normalized = normalizeCourseRow(row, termCode, year);
    map.set(normalized.course_code, {
      ...normalized,
      canonical_source: "umd",
    });
  }

  for (const row of jupiterRows) {
    const normalized = normalizeCourseRow(row, termCode, year);
    const existing = map.get(normalized.course_code);
    map.set(normalized.course_code, {
      ...existing,
      ...normalized,
      geneds: dedupeStrings([...(existing?.geneds ?? []), ...(normalized.geneds ?? [])]),
      conditions: normalized.conditions ?? existing?.conditions ?? null,
      canonical_source: "jupiter",
    });
  }

  return Array.from(map.values());
}

function mergeSections(jupiterSections, umdSections, termCode, year, courseCode) {
  const byCode = new Map();

  for (const raw of umdSections) {
    const section = normalizeSection(raw, termCode, year, courseCode);
    byCode.set(section.section_code, section);
  }

  for (const raw of jupiterSections) {
    const section = normalizeSection(raw, termCode, year, courseCode);
    const existing = byCode.get(section.section_code);
    if (!existing) {
      byCode.set(section.section_code, section);
      continue;
    }

    const mergedMeetings = [...existing.meetings, ...section.meetings];
    const meetingKeys = new Set();
    const dedupedMeetings = [];

    for (const meeting of mergedMeetings) {
      const key = [
        meeting.days ?? "",
        meeting.start_time ?? "",
        meeting.end_time ?? "",
        meeting.building ?? "",
        meeting.room ?? "",
        meeting.location ?? "",
        meeting.classtype ?? "",
      ].join("|").toLowerCase();

      if (meetingKeys.has(key)) continue;
      meetingKeys.add(key);
      dedupedMeetings.push(meeting);
    }

    byCode.set(section.section_code, {
      ...existing,
      ...section,
      instructors: dedupeStrings([...(existing.instructors ?? []), ...(section.instructors ?? [])]),
      meetings: dedupedMeetings,
    });
  }

  return Array.from(byCode.values());
}

async function runInBatches(items, batchSize, worker) {
  const output = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(worker));
    output.push(...results);
  }

  return output;
}

function getSectionsHash(sectionsByCourse) {
  const courseCodes = Object.keys(sectionsByCourse).sort();
  const stable = [];

  for (const courseCode of courseCodes) {
    const sections = [...(sectionsByCourse[courseCode] ?? [])].sort((a, b) => a.section_key.localeCompare(b.section_key));
    stable.push({
      courseCode,
      sections: sections.map((section) => ({
        section_key: section.section_key,
        instructor: section.instructor,
        instructors: section.instructors,
        total_seats: section.total_seats,
        open_seats: section.open_seats,
        waitlist: section.waitlist,
        holdfile: section.holdfile,
        source_updated_at: section.source_updated_at,
        meetings: [...section.meetings].sort((a, b) => {
          const ka = `${a.days}|${a.start_time}|${a.end_time}|${a.building}|${a.room}|${a.location}|${a.classtype}`;
          const kb = `${b.days}|${b.start_time}|${b.end_time}|${b.building}|${b.room}|${b.location}|${b.classtype}`;
          return ka.localeCompare(kb);
        }),
      })),
    });
  }

  return sha(JSON.stringify(stable));
}

async function loadWatermarks(pool, resources) {
  const client = await pool.connect();
  try {
    const map = {};
    for (const resource of resources) {
      const { rows } = await client.query(
        `select watermark
         from orbit.sync_watermarks
         where source_id = $1 and resource_type = $2`,
        [resource.sourceId, resource.resourceType]
      );
      map[`${resource.sourceId}:${resource.resourceType}`] = rows[0]?.watermark ?? null;
    }
    return map;
  } finally {
    client.release();
  }
}

async function recordNoopSync(pool, trigger, summary) {
  const client = await pool.connect();
  try {
    await client.query(
      `insert into orbit.sync_runs(status, trigger, started_at, ended_at, summary)
       values ('success', $1, now(), now(), $2::jsonb)`,
      [trigger, JSON.stringify(summary)]
    );
  } finally {
    client.release();
  }
}

async function upsertCatalogRows(rows, sectionsByCourse, professors, syncMeta, options) {
  const { dryRun, trigger } = options;

  if (dryRun) {
    const sectionCount = Object.values(sectionsByCourse).reduce((sum, sections) => sum + sections.length, 0);
    console.log(`[dry-run] would upsert ${rows.length} courses, ${sectionCount} sections, ${professors.length} professors`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL for non-dry-run execution");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let runId = null;

  try {
    const runResult = await client.query(
      `insert into orbit.sync_runs(status, trigger, summary)
       values ('running', $1, '{}'::jsonb)
       returning id`,
      [trigger]
    );
    runId = runResult.rows[0].id;

    await client.query("begin");

    if (rows.length === 0) {
      throw new Error("Refusing to sync empty course set; possible upstream failure");
    }

    await client.query(
      `insert into orbit.catalog_terms(term_code, year, label, active)
       values ($1, $2, $3, true)
       on conflict (term_code, year)
       do update set label = excluded.label, active = true`,
      [rows[0].term_code, rows[0].year, toTermLabel(rows[0].term_code, rows[0].year)]
    );

    for (const course of rows) {
      await client.query(
        `insert into orbit.courses(
          course_code, term_code, year, name, dept_id,
          min_credits, max_credits, credits, description,
          geneds, conditions, canonical_source, source_fingerprint, merged_at
        ) values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, now()
        )
        on conflict (course_code, term_code, year)
        do update set
          name = excluded.name,
          dept_id = excluded.dept_id,
          min_credits = excluded.min_credits,
          max_credits = excluded.max_credits,
          credits = excluded.credits,
          description = excluded.description,
          geneds = excluded.geneds,
          conditions = excluded.conditions,
          canonical_source = excluded.canonical_source,
          source_fingerprint = excluded.source_fingerprint,
          merged_at = now()`,
        [
          course.course_code,
          course.term_code,
          course.year,
          course.name,
          course.dept_id,
          course.min_credits,
          course.max_credits,
          course.credits,
          course.description,
          course.geneds,
          course.conditions,
          course.canonical_source ?? "jupiter",
          course.source_fingerprint,
        ]
      );
    }

    for (const sections of Object.values(sectionsByCourse)) {
      for (const section of sections) {
        await client.query(
          `insert into orbit.sections(
            section_key, course_code, section_code, term_code, year,
            instructor, instructors, total_seats, open_seats, waitlist,
            holdfile, canonical_source, source_updated_at, merge_conflicts, merged_at
          ) values (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13::timestamptz, $14::jsonb, now()
          )
          on conflict (section_key)
          do update set
            course_code = excluded.course_code,
            section_code = excluded.section_code,
            term_code = excluded.term_code,
            year = excluded.year,
            instructor = excluded.instructor,
            instructors = excluded.instructors,
            total_seats = excluded.total_seats,
            open_seats = excluded.open_seats,
            waitlist = excluded.waitlist,
            holdfile = excluded.holdfile,
            canonical_source = excluded.canonical_source,
            source_updated_at = excluded.source_updated_at,
            merge_conflicts = excluded.merge_conflicts,
            merged_at = now()`,
          [
            section.section_key,
            section.course_code,
            section.section_code,
            section.term_code,
            section.year,
            section.instructor,
            section.instructors,
            section.total_seats,
            section.open_seats,
            section.waitlist,
            section.holdfile,
            "jupiter",
            section.source_updated_at,
            null,
          ]
        );

        await client.query(`delete from orbit.meetings where section_key = $1`, [section.section_key]);

        for (const meeting of section.meetings) {
          await client.query(
            `insert into orbit.meetings(
              section_key, days, start_time, end_time,
              building, room, location, classtype
            ) values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict (section_key, canonical_key)
            do update set
              days = excluded.days,
              start_time = excluded.start_time,
              end_time = excluded.end_time,
              building = excluded.building,
              room = excluded.room,
              location = excluded.location,
              classtype = excluded.classtype`,
            [
              section.section_key,
              meeting.days,
              meeting.start_time,
              meeting.end_time,
              meeting.building,
              meeting.room,
              meeting.location,
              meeting.classtype,
            ]
          );
        }
      }
    }

    for (const professor of professors) {
      const name = sanitizeString(professor.name ?? professor.professor ?? professor.display_name);
      if (!name) continue;
      const slug = sanitizeString(professor.slug ?? professor.professor_slug);
      const averageRating = Number(professor.average_rating ?? professor.averageRating ?? professor.avg_rating);
      const ratingCount = Number(professor.rating_count ?? professor.ratings ?? professor.reviews_count);

      await client.query(
        `insert into orbit.instructors(
          normalized_name, display_name, planetterp_slug,
          average_rating, rating_count, ambiguous
        ) values ($1, $2, $3, $4, $5, false)
        on conflict (normalized_name)
        do update set
          display_name = excluded.display_name,
          planetterp_slug = excluded.planetterp_slug,
          average_rating = excluded.average_rating,
          rating_count = excluded.rating_count,
          ambiguous = excluded.ambiguous,
          updated_at = now()`,
        [
          name.toLowerCase().replace(/\s+/g, " "),
          name,
          slug,
          Number.isFinite(averageRating) ? averageRating : null,
          Number.isFinite(ratingCount) ? ratingCount : null,
        ]
      );
    }

    const incomingCourseCodes = rows.map((course) => course.course_code);
    await client.query(
      `delete from orbit.courses
       where term_code = $1 and year = $2 and not (course_code = any($3::text[]))`,
      [rows[0].term_code, rows[0].year, incomingCourseCodes]
    );

    if (syncMeta.sectionFailures === 0) {
      const incomingSectionKeys = Object.values(sectionsByCourse)
        .flatMap((sections) => sections.map((section) => section.section_key));

      if (incomingSectionKeys.length > 0) {
        await client.query(
          `delete from orbit.sections
           where term_code = $1 and year = $2 and not (section_key = any($3::text[]))`,
          [rows[0].term_code, rows[0].year, incomingSectionKeys]
        );
      } else {
        // If no sections are present in the upstream payload, clear the term-year to avoid stale rows.
        await client.query(
          `delete from orbit.sections
           where term_code = $1 and year = $2`,
          [rows[0].term_code, rows[0].year]
        );
      }
    }

    for (const watermark of syncMeta.newWatermarks) {
      await client.query(
        `insert into orbit.sync_watermarks(source_id, resource_type, watermark, updated_at)
         values ($1, $2, $3, now())
         on conflict (source_id, resource_type)
         do update set watermark = excluded.watermark, updated_at = now()`,
        [watermark.sourceId, watermark.resourceType, watermark.hash]
      );
    }

    await client.query(
      `update orbit.sources
       set last_success_at = now()
       where id = any($1::text[])`,
      [["jupiter", "umd", "planetterp"]]
    );

    const sectionCount = Object.values(sectionsByCourse).reduce((sum, sections) => sum + sections.length, 0);
    const status = syncMeta.sectionFailures > 0 ? "partial" : "success";

    await client.query(
      `update orbit.sync_runs
       set status = $2, ended_at = now(), summary = $3::jsonb
       where id = $1`,
      [
        runId,
        status,
        JSON.stringify({
          courses: rows.length,
          sections: sectionCount,
          professors: professors.length,
          sectionFailures: syncMeta.sectionFailures,
        }),
      ]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (runId !== null) {
      await client.query(
        `update orbit.sync_runs
         set status = 'failed', ended_at = now(), error_message = $2
         where id = $1`,
        [runId, error instanceof Error ? error.message : String(error)]
      );
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs();
  const jupiterBase = process.env.JUPITER_BASE_URL;
  const umdBase = process.env.UMD_BASE_URL ?? "https://api.umd.io/v1";
  const planetterpBase = process.env.PLANETTERP_BASE_URL ?? "https://planetterp.com/api/v1";

  const [jupiterRows, umdRows, planetterpRows] = await Promise.all([
    fetchJupiterCatalog({ jupiterBase, termCode: args.termCode, year: args.year }).catch(() => []),
    fetchUmdCatalog({ umdBase, termCode: args.termCode, year: args.year }).catch(() => []),
    fetchPlanetTerpProfessors({ planetterpBase }).catch(() => []),
  ]);

  const merged = mergeByCourseCode(jupiterRows, umdRows, args.termCode, args.year);
  const jupiterByCode = new Map(
    jupiterRows.map((row) => [String(row.courseCode ?? row.course_id ?? "").trim().toUpperCase(), row])
  );

  const sectionResults = await runInBatches(
    merged,
    args.batchSize,
    async (course) => {
      const jupiterCourse = jupiterByCode.get(course.course_code);
      const jupiterSections = Array.isArray(jupiterCourse?.sections) ? jupiterCourse.sections : [];

      try {
        const umdSections = await fetchUmdSectionsForCourse({
          umdBase,
          courseCode: course.course_code,
          termCode: args.termCode,
          year: args.year,
        });

        return {
          courseCode: course.course_code,
          sections: mergeSections(jupiterSections, umdSections, args.termCode, args.year, course.course_code),
          failed: false,
        };
      } catch {
        return {
          courseCode: course.course_code,
          sections: mergeSections(jupiterSections, [], args.termCode, args.year, course.course_code),
          failed: true,
        };
      }
    }
  );

  const sectionsByCourse = Object.fromEntries(
    sectionResults.map((result) => [result.courseCode, result.sections])
  );
  const sectionFailures = sectionResults.filter((result) => result.failed).length;

  const newWatermarks = [
    {
      sourceId: "jupiter",
      resourceType: `courses:${args.termCode}:${args.year}`,
      hash: sha(JSON.stringify(jupiterRows)),
    },
    {
      sourceId: "umd",
      resourceType: `courses:${args.termCode}:${args.year}`,
      hash: sha(JSON.stringify(umdRows)),
    },
    {
      sourceId: "umd",
      resourceType: `sections:${args.termCode}:${args.year}`,
      hash: getSectionsHash(sectionsByCourse),
    },
    {
      sourceId: "planetterp",
      resourceType: "instructors",
      hash: sha(JSON.stringify(planetterpRows)),
    },
  ];

  if (!args.dryRun && process.env.DATABASE_URL && args.incremental) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const previous = await loadWatermarks(pool, newWatermarks);
    await pool.end();

    const unchanged = newWatermarks.every((wm) => {
      const prev = previous[`${wm.sourceId}:${wm.resourceType}`];
      return prev !== null && prev === wm.hash;
    });

    if (unchanged && !args.forceFull) {
      const writePool = new Pool({ connectionString: process.env.DATABASE_URL });
      await recordNoopSync(writePool, args.trigger, {
        skipped: true,
        reason: "watermark-unchanged",
        term: `${args.termCode}-${args.year}`,
      });
      await writePool.end();

      console.log(`sync skipped (incremental): ${args.termLabel} ${args.year}`);
      return;
    }
  }

  await upsertCatalogRows(
    merged,
    sectionsByCourse,
    planetterpRows,
    {
      newWatermarks,
      sectionFailures,
    },
    {
      dryRun: args.dryRun,
      trigger: args.trigger,
    }
  );

  const sectionCount = Object.values(sectionsByCourse).reduce((sum, sections) => sum + sections.length, 0);
  console.log(`sync complete: ${args.termLabel} ${args.year}, courses=${merged.length}, sections=${sectionCount}, sectionFailures=${sectionFailures}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
