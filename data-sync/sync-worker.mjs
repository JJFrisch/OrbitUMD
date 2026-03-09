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
    trigger: args.trigger === "scheduled" ? "scheduled" : "manual",
    termLabel: term,
    termCode: TERM_CODE_BY_LABEL[term],
    year,
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

    const meetings = [...existing.meetings, ...section.meetings];
    const canonicalMeetingSet = new Set();
    const dedupedMeetings = [];
    for (const meeting of meetings) {
      const key = [
        meeting.days ?? "",
        meeting.start_time ?? "",
        meeting.end_time ?? "",
        meeting.building ?? "",
        meeting.room ?? "",
        meeting.location ?? "",
        meeting.classtype ?? "",
      ].join("|").toLowerCase();

      if (canonicalMeetingSet.has(key)) continue;
      canonicalMeetingSet.add(key);
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
      geneds: dedupeStrings([...(existing?.geneds ?? []), ...(normalized.geneds ?? [])]),
      conditions: normalized.conditions ?? existing?.conditions ?? null,
      canonical_source: "jupiter",
    });
  }

  return Array.from(map.values());
}

async function upsertCatalogRows(rows, sectionsByCourse, professors, { dryRun, trigger }) {
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

    if (rows.length > 0) {
      await client.query(
        `insert into orbit.catalog_terms(term_code, year, label, active)
         values ($1, $2, $3, true)
         on conflict (term_code, year)
         do update set label = excluded.label, active = true`,
        [rows[0].term_code, rows[0].year, toTermLabel(rows[0].term_code, rows[0].year)]
      );
    }

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

    for (const [courseCode, sections] of Object.entries(sectionsByCourse)) {
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

      if (sections.length === 0) {
        await client.query(`delete from orbit.sections where course_code = $1 and term_code = $2 and year = $3`, [courseCode, rows[0]?.term_code, rows[0]?.year]);
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

    await client.query(
      `update orbit.sources
       set last_success_at = now()
       where id = any($1::text[])`,
      [["jupiter", "umd", "planetterp"]]
    );

    const sectionCount = Object.values(sectionsByCourse).reduce((sum, sections) => sum + sections.length, 0);
    await client.query(
      `update orbit.sync_runs
       set status = 'success', ended_at = now(), summary = $2::jsonb
       where id = $1`,
      [
        runId,
        JSON.stringify({
          courses: rows.length,
          sections: sectionCount,
          professors: professors.length,
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

  const [jupiterRows, umdRows] = await Promise.all([
    fetchJupiterCatalog({ jupiterBase, termCode: args.termCode, year: args.year }).catch(() => []),
    fetchUmdCatalog({ umdBase, termCode: args.termCode, year: args.year }).catch(() => []),
  ]);

  const [planetterpRows] = await Promise.all([
    fetchPlanetTerpProfessors({ planetterpBase }).catch(() => []),
  ]);

  const merged = mergeByCourseCode(jupiterRows, umdRows, args.termCode, args.year);

  const sectionsByCourse = {};
  for (const course of merged) {
    const jupiterCourse = jupiterRows.find((row) => String(row.courseCode ?? row.course_id ?? "").trim().toUpperCase() === course.course_code);
    const jupiterSections = Array.isArray(jupiterCourse?.sections) ? jupiterCourse.sections : [];
    const umdSections = await fetchUmdSectionsForCourse({
      umdBase,
      courseCode: course.course_code,
      termCode: args.termCode,
      year: args.year,
    }).catch(() => []);

    sectionsByCourse[course.course_code] = mergeSections(jupiterSections, umdSections, args.termCode, args.year, course.course_code);
  }

  await upsertCatalogRows(merged, sectionsByCourse, planetterpRows, {
    ...args,
    trigger: "manual",
  });

  console.log(`sync complete: ${args.termLabel} ${args.year}, merged rows=${merged.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
