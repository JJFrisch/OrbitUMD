#!/usr/bin/env node

/**
 * Transform CS scraper output into a specialization-aware structure.
 *
 * Input: Raw scraper output with sections keyed by h2 headings.
 * Output: {
 *   baseRequirements: [ ... ],
 *   specializations: [
 *     { id, name, description, requirements: [ ... ] },
 *     ...
 *   ]
 * }
 */

function normalizeText(text) {
  return (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract course codes from text (e.g., "CMSC320" or "MATH/AMSC/STAT xxx")
 */
function extractCourseTokens(text) {
  const normalized = normalizeText(text).toUpperCase();
  const matches =
    normalized.match(/\b[A-Z]{3,5}(?:\/[A-Z]{3,5})*\s*(?:\d{3}[A-Z]?|[1-4]XX|XXX)\b/g) || [];
  return [...new Set(matches.map((m) => normalizeText(m)))];
}

/**
 * Parse "Select N ..." or "Choose N ..." to extract count
 */
function parseSelectCount(text) {
  const normalized = normalizeText(text).toLowerCase();
  const digit = normalized.match(/\b(select|choose|take)\s+(\d+)\b/i);
  if (digit) return parseInt(digit[2], 10);
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const word = normalized.match(
    /\b(select|choose|take)\s+(one|two|three|four|five|six)\b/i
  );
  return word ? words[word[2]] : null;
}

/**
 * Convert a requirement group (from scraper) into a cleaner structure.
 * Handles:
 * - Individual required courses
 * - "Select N of the following" groups
 * - Area-based groups with constraints
 */
function transformGroup(group, context = {}) {
  const { kind, description, rows, subgroups, n, creditsRequirement } = group;

  if (kind === "all" || kind === "n-of") {
    // Paragraph-style: "Select N courses from: CODE1 CODE2 ..."
    if (context.source === "paragraph") {
      const courseCodes = [];
      for (const row of rows || []) {
        if (row.courseCode) courseCodes.push(row.courseCode);
      }

      return {
        type: n ? "CHOOSE_N" : "ALL",
        count: n || undefined,
        description: description || null,
        credits: creditsRequirement || null,
        courseCodes,
        courses: rows || [],
      };
    }

    // Table-style: rows are courses, subgroups are areas or selections
    if ((subgroups || []).length > 0) {
      // This group has sub-items (areas, selections)
      return {
        type: "GROUP",
        description: description || null,
        credits: creditsRequirement || null,
        items: (subgroups || []).map((sg) => transformGroup(sg, context)),
      };
    }

    // Flat list of courses
    const courseCodes = [];
    for (const row of rows || []) {
      if (row.courseCode) courseCodes.push(row.courseCode);
    }

    return {
      type: "ALL",
      description: description || null,
      credits: creditsRequirement || null,
      courseCodes,
      courses: rows || [],
    };
  }

  return null;
}

/**
 * Identify which section is the base major (before first ## h2 heading).
 * Returns { baseSection, specializationSections }
 */
function partitionSections(sections) {
  const baseIdx = sections.findIndex((s) => s.id !== "general-track");
  if (baseIdx === -1) {
    return {
      baseSection: sections[0],
      specializationSections: sections.slice(1),
    };
  }

  return {
    baseSection: sections[0],
    specializationSections: sections.slice(1),
  };
}

/**
 * Map specialization ID to nicer title
 */
function specializationTitle(id) {
  const map = {
    "cybersecurity-specialization": "Cybersecurity",
    "data-science-specialization": "Data Science",
    "machine-learning-specialization": "Machine Learning",
    "quantum-information-specialization": "Quantum Information",
  };
  return map[id] || id;
}

/**
 * Main transform: scraper output → specialization-aware struct
 */
export function transformCsRequirements(scraperOutput) {
  const { sections } = scraperOutput;

  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("Invalid scraper output: no sections found");
  }

  const { baseSection, specializationSections } = partitionSections(sections);

  // Transform base section
  const baseRequirements = (baseSection.requirementGroups || [])
    .map((group) => transformGroup(group))
    .filter(Boolean);

  // Transform specialization sections
  const specializations = specializationSections.map((section) => ({
    id: section.id,
    name: specializationTitle(section.id),
    description: null,
    requirements: (section.requirementGroups || [])
      .map((group) => transformGroup(group))
      .filter(Boolean),
  }));

  return {
    program: {
      id: "computer-science-major",
      name: "Computer Science Major",
      type: "major",
    },
    baseRequirements,
    specializations,
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];

  if (!input) {
    console.error(
      "Usage: node transform_cs_requirements.js <path-to-scraper-output.json>"
    );
    process.exit(1);
  }

  const fs = await import("fs/promises");

  try {
    const content = await fs.readFile(input, "utf-8");
    const scraperOutput = JSON.parse(content);
    const transformed = transformCsRequirements(scraperOutput);
    console.log(JSON.stringify(transformed, null, 2));
  } catch (error) {
    console.error("Transform failed:", error.message);
    process.exit(1);
  }
}

export default transformCsRequirements;
