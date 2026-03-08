import { createClient } from "@supabase/supabase-js";

const UMD_BASE = process.env.UMD_API_BASE_URL ?? "https://api.umd.io/v1";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TERM_CODES = (process.env.UMD_SYNC_TERMS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const PAGE_SIZE = Number(process.env.UMD_SYNC_PAGE_SIZE ?? 100);
const MAX_COURSES_PER_TERM = Number(process.env.UMD_SYNC_MAX_COURSES_PER_TERM ?? 0);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseTermCode(termCode) {
  const year = Number(termCode.slice(0, 4));
  const seasonCode = termCode.slice(4);
  const season = seasonCode === "01" ? "winter" : seasonCode === "03" ? "spring" : seasonCode === "06" ? "summer" : "fall";
  return { termCode, year, season };
}

function parseCredits(raw) {
  const numberValue = Number(raw);
  if (Number.isFinite(numberValue)) {
    return { min: numberValue, max: numberValue };
  }

  const split = raw.split("-").map((value) => Number(value));
  if (split.length === 2 && split.every((value) => Number.isFinite(value))) {
    return { min: split[0], max: split[1] };
  }

  return { min: 0, max: 0 };
}

function parseDays(raw) {
  const days = [];
  let i = 0;

  while (i < raw.length) {
    const nextTwo = raw.slice(i, i + 2);
    if (nextTwo === "Tu" || nextTwo === "Th") {
      days.push(nextTwo);
      i += 2;
      continue;
    }

    const single = raw[i];
    if (single === "M" || single === "W" || single === "F") {
      days.push(single);
    }

    i += 1;
  }

  return days;
}

function parseTime(raw) {
  const [hourPart, minutePart] = raw.split(":");
  return Number(hourPart) * 60 + Number(minutePart);
}

async function getJson(path, query) {
  const url = new URL(path, UMD_BASE.endsWith("/") ? UMD_BASE : `${UMD_BASE}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`UMD request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchCoursesForTerm(termCode) {
  const courses = [];
  let page = 1;

  while (true) {
    const result = await getJson("courses", { term: termCode, page, per_page: PAGE_SIZE });
    if (!Array.isArray(result) || result.length === 0) {
      break;
    }

    courses.push(...result);
    if (MAX_COURSES_PER_TERM > 0 && courses.length >= MAX_COURSES_PER_TERM) {
      return courses.slice(0, MAX_COURSES_PER_TERM);
    }

    page += 1;
  }

  return courses;
}

async function upsertTerm(termCode) {
  const { year, season } = parseTermCode(termCode);
  const { data, error } = await supabase
    .from("terms")
    .upsert({
      umd_term_code: termCode,
      year,
      season,
    }, { onConflict: "umd_term_code" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function syncCourse(termId, termCode, course) {
  const credits = parseCredits(course.credits ?? "0");
  const [deptId, courseNumber = ""] = String(course.course_id).split(/(?=\d)/);

  const { data: savedCourse, error: courseError } = await supabase
    .from("courses")
    .upsert({
      umd_course_id: course.course_id,
      dept_id: deptId || course.dept_id,
      course_number: courseNumber,
      title: course.name,
      description: course.description ?? null,
      min_credits: credits.min,
      max_credits: credits.max,
      updated_at: new Date().toISOString(),
    }, { onConflict: "umd_course_id" })
    .select("id")
    .single();

  if (courseError) {
    throw courseError;
  }

  const courseId = savedCourse.id;

  const { data: offering, error: offeringError } = await supabase
    .from("course_offerings")
    .upsert({
      course_id: courseId,
      term_id: termId,
    }, { onConflict: "course_id,term_id" })
    .select("id")
    .single();

  if (offeringError) {
    throw offeringError;
  }

  const offeringId = offering.id;

  const genEdTags = Array.isArray(course.gen_ed) ? course.gen_ed.filter(Boolean) : [];
  if (genEdTags.length > 0) {
    const tagRows = genEdTags.map((code) => ({ code, label: code }));
    const { error: tagsError } = await supabase.from("gen_ed_tags").upsert(tagRows, { onConflict: "code" });
    if (tagsError) {
      throw tagsError;
    }

    const mappingRows = genEdTags.map((genEdCode) => ({
      course_id: courseId,
      gen_ed_code: genEdCode,
    }));

    const { error: mapError } = await supabase.from("course_gen_ed_tags").upsert(mappingRows, {
      onConflict: "course_id,gen_ed_code",
    });

    if (mapError) {
      throw mapError;
    }
  }

  const sections = await getJson("courses/sections", { term: termCode, course: course.course_id });

  for (const section of sections) {
    const [openSeats, seatCapacity] = String(section.seats ?? "").split("/").map((value) => Number(value));

    const { data: savedSection, error: sectionError } = await supabase
      .from("sections")
      .upsert({
        offering_id: offeringId,
        umd_section_id: section.section_id,
        section_code: section.section_id,
        instructor_name: section.instructor ?? null,
        seat_open: Number.isFinite(openSeats) ? openSeats : null,
        seat_capacity: Number.isFinite(seatCapacity) ? seatCapacity : null,
      }, { onConflict: "offering_id,umd_section_id" })
      .select("id")
      .single();

    if (sectionError) {
      throw sectionError;
    }

    const sectionId = savedSection.id;
    const { error: deleteMeetingsError } = await supabase.from("section_meetings").delete().eq("section_id", sectionId);
    if (deleteMeetingsError) {
      throw deleteMeetingsError;
    }

    const meetings = Array.isArray(section.meetings) ? section.meetings : [];
    if (meetings.length > 0) {
      const rows = meetings.map((meeting) => ({
        section_id: sectionId,
        days: parseDays(meeting.days ?? ""),
        start_minutes: parseTime(meeting.start_time),
        end_minutes: parseTime(meeting.end_time),
        location: meeting.room ?? null,
      }));

      const { error: meetingsError } = await supabase.from("section_meetings").insert(rows);
      if (meetingsError) {
        throw meetingsError;
      }
    }
  }

  return sections.length;
}

async function getTermsToSync() {
  if (TERM_CODES.length > 0) {
    return TERM_CODES;
  }

  const terms = await getJson("terms");
  if (!Array.isArray(terms)) {
    throw new Error("UMD terms response is invalid");
  }

  return terms.slice(-4);
}

async function main() {
  const startedAt = new Date().toISOString();
  const terms = await getTermsToSync();

  const { data: runRow, error: runStartError } = await supabase
    .from("catalog_sync_runs")
    .insert({
      triggered_by: process.env.GITHUB_ACTIONS ? "github-actions" : "manual",
      term_codes: terms,
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (runStartError) {
    throw runStartError;
  }

  const runId = runRow.id;

  let syncedCourses = 0;
  let syncedSections = 0;

  try {
    for (const termCode of terms) {
      const termId = await upsertTerm(termCode);
      const courses = await fetchCoursesForTerm(termCode);

      for (const course of courses) {
        const sectionCount = await syncCourse(termId, termCode, course);
        syncedCourses += 1;
        syncedSections += sectionCount;
      }
    }

    await supabase
      .from("catalog_sync_runs")
      .update({
        status: "succeeded",
        synced_courses: syncedCourses,
        synced_sections: syncedSections,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (error) {
    await supabase
      .from("catalog_sync_runs")
      .update({
        status: "failed",
        synced_courses: syncedCourses,
        synced_sections: syncedSections,
        error_message: error instanceof Error ? error.message : String(error),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw error;
  }

  console.log(JSON.stringify({ startedAt, completedAt: new Date().toISOString(), syncedCourses, syncedSections, terms }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
