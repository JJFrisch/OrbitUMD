#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const SITEMAP_URL = "https://academiccatalog.umd.edu/sitemap.xml";
const DEFAULT_OUTPUT = path.resolve(
	__dirname,
	"../site/src/lib/data/current_degree_requirements_umd.json"
);

const NUMBER_WORDS = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
};

function normalizeText(value) {
	return (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
	const args = {
		output: DEFAULT_OUTPUT,
		maxPrograms: 0,
		concurrency: 8,
	};

	for (let i = 2; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--output" && argv[i + 1]) {
			args.output = path.resolve(process.cwd(), argv[i + 1]);
			i += 1;
			continue;
		}
		if (arg === "--max-programs" && argv[i + 1]) {
			args.maxPrograms = Number.parseInt(argv[i + 1], 10) || 0;
			i += 1;
			continue;
		}
		if (arg === "--concurrency" && argv[i + 1]) {
			args.concurrency = Math.max(1, Number.parseInt(argv[i + 1], 10) || 8);
			i += 1;
			continue;
		}
	}

	return args;
}

async function fetchText(url, retries = 2) {
	let lastError = null;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} for ${url}`);
			}
			return await response.text();
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

function extractSitemapUrls(xml) {
	const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
	const urls = [];
	for (const match of matches) {
		urls.push(match[1].trim());
	}
	return urls;
}

function isProgramUrl(url) {
	const lower = url.toLowerCase();
	if (!lower.startsWith("https://academiccatalog.umd.edu/undergraduate/")) return false;
	if (!lower.includes("/colleges-schools/")) return false;
	return lower.includes("-major/") || lower.includes("-minor/");
}

function classifyProgramType(url, title) {
	const lower = `${url} ${title}`.toLowerCase();
	if (lower.includes("-minor/") || /\bminor\b/.test(lower)) return "minor";
	return "major";
}

function parseChooseCount(text) {
	const normalized = normalizeText(text).toLowerCase();
	const digit = normalized.match(/\b(select|choose|take)\s+(\d+)\b/i);
	if (digit) return Number.parseInt(digit[2], 10);
	const word = normalized.match(
		/\b(select|choose|take)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i
	);
	if (!word) return null;
	return NUMBER_WORDS[word[2]] || null;
}

function normalizeCourseCode(raw) {
	const text = normalizeText(raw);
	if (!text) return null;

	const connectorMatch = text.match(/^(or|and)\s+/i);
	const connector = connectorMatch ? connectorMatch[1].toLowerCase() : null;
	const withoutConnector = text.replace(/^(or|and)\s+/i, "").trim();

	const pattern = /([A-Z]{2,6}(?:\/[A-Z]{2,6})?\s*(?:\d{3}[A-Z]?|[1-4]XX|XXX))/i;
	const match = withoutConnector.match(pattern);
	if (!match) return null;

	return {
		courseCode: normalizeText(match[1]).toUpperCase().replace(/\s+/g, ""),
		connector,
	};
}

function parseRowKind(row) {
	const codeRaw = normalizeText(row.course_code);
	const title = normalizeText(row.title);
	const credits = normalizeText(row.credits) || null;
	const combined = normalizeText(`${codeRaw} ${title}`);

	if (!combined) return { kind: "empty" };
	if (/^total credits\b/i.test(codeRaw) || /^total credits\b/i.test(combined)) {
		return { kind: "total", text: combined, credits };
	}
	if (/^(and|or|and\/or)$/i.test(codeRaw)) {
		return { kind: "connector", connector: codeRaw.toLowerCase() };
	}

	const parsedCourse = normalizeCourseCode(codeRaw);
	if (parsedCourse) {
		return {
			kind: "course",
			courseCode: parsedCourse.courseCode,
			connector: parsedCourse.connector,
			title,
			credits,
		};
	}

	const chooseCount = parseChooseCount(combined);
	if (/\b(select|choose|take)\b/i.test(combined)) {
		return { kind: "choice_header", text: combined, chooseCount, credits };
	}

	return { kind: "label", text: combined, credits };
}

function groupItemsFromSequence(sequence) {
	if (!sequence.length) return [];
	const chunks = [[]];

	for (const [connector, course] of sequence) {
		if (connector === "and" && chunks[chunks.length - 1].length > 0) {
			chunks.push([course]);
		} else {
			chunks[chunks.length - 1].push(course);
		}
	}

	const items = [];
	for (const chunk of chunks) {
		if (chunk.length === 1) {
			items.push(chunk[0]);
		} else {
			items.push({ type: "OR", items: chunk });
		}
	}

	return items;
}

function builderSectionsFromRows(rows, blockIndex) {
	const sections = [];
	let currentSection = null;
	let sequence = [];

	function ensureSection(defaultTitle) {
		if (!currentSection) {
			currentSection = {
				title: defaultTitle,
				requirementType: "all",
				items: [],
				rules: [],
			};
			sections.push(currentSection);
		}
		return currentSection;
	}

	function flushSequence() {
		if (!currentSection) return;
		const grouped = groupItemsFromSequence(sequence);
		if (grouped.length) {
			currentSection.items.push(...grouped);
		}
		sequence = [];
	}

	for (const row of rows) {
		const parsed = parseRowKind(row);
		const kind = parsed.kind;

		if (kind === "empty") continue;

		if (kind === "total") {
			flushSequence();
			ensureSection(`Requirement Block ${blockIndex + 1}`).rules.push(parsed.text);
			continue;
		}

		if (kind === "label" || kind === "choice_header") {
			flushSequence();
			const text = parsed.text;
			const looksLikeHeading =
				kind === "choice_header" ||
				text.endsWith(":") ||
				(parsed.credits !== null && !text.toLowerCase().startsWith("or "));

			if (looksLikeHeading) {
				const sectionType = kind === "choice_header" ? "choose" : "all";
				const nextSection = {
					title: text.replace(/:$/, ""),
					requirementType: sectionType,
					items: [],
					rules: [],
				};
				if (sectionType === "choose" && parsed.chooseCount) {
					nextSection.chooseCount = parsed.chooseCount;
				}
				sections.push(nextSection);
				currentSection = nextSection;
			} else {
				ensureSection(`Requirement Block ${blockIndex + 1}`).rules.push(text);
			}
			continue;
		}

		if (kind === "connector") {
			if (sequence.length) {
				sequence.push([parsed.connector, { code: "" }]);
			}
			continue;
		}

		if (kind === "course") {
			const section = ensureSection(`Requirement Block ${blockIndex + 1}`);
			let connector = parsed.connector || "or";
			while (sequence.length && sequence[sequence.length - 1][1].code === "") {
				connector = sequence[sequence.length - 1][0];
				sequence.pop();
			}

			sequence.push([connector, { code: parsed.courseCode }]);
			if (parsed.title) {
				section.rules.push(`${parsed.courseCode}: ${parsed.title}`);
			}
		}
	}

	flushSequence();
	return sections.filter((section) => section.items.length || section.rules.length);
}

function parseRequirementContainer($, $container) {
	const textBlocks = [];
	const courseBlocks = [];

	$container.find("p, li").each((_, node) => {
		const line = normalizeText($(node).text());
		if (line) textBlocks.push(line);
	});

	$container.find("table").each((tableIndex, tableNode) => {
		const $table = $(tableNode);
		const rows = [];

		$table.find("tr").each((_, rowNode) => {
			const $row = $(rowNode);
			const cells = $row.find("th, td").toArray().map((cell) => $(cell));
			if (!cells.length) return;

			const firstTag = (cells[0].prop("tagName") || "").toLowerCase();
			if (firstTag === "th") return;

			const course_code = normalizeText(cells[0] ? cells[0].text() : "");
			const title = normalizeText(cells[1] ? cells[1].text() : "");
			const credits = normalizeText(cells[cells.length - 1] ? cells[cells.length - 1].text() : "");
			if (!course_code && !title && !credits) return;

			rows.push({ course_code, title, credits });
		});

		if (!rows.length) return;

		const courses = [];
		for (const row of rows) {
			const parsed = normalizeCourseCode(row.course_code);
			if (!parsed) continue;
			courses.push({
				courseCode: parsed.courseCode,
				title: row.title || "",
				credits: row.credits || null,
			});
		}

		courseBlocks.push({
			kind: "course_list_table",
			courses,
			builderSections: builderSectionsFromRows(rows, tableIndex),
		});
	});

	return { textBlocks, courseBlocks };
}

function flattenBuilderSections(courseBlocks) {
	const sections = [];
	for (const block of courseBlocks) {
		for (const section of block.builderSections || []) {
			sections.push(section);
		}
	}
	return sections;
}

function extractSpecializationLines(lines) {
	return lines.filter((line) => /\b(specialization|track|concentration|option)\b/i.test(line));
}

async function scrapeProgram(url) {
	const html = await fetchText(url);
	const $ = cheerio.load(html);

	const pageTitle = normalizeText($("h1.page-title, h1").first().text());
	const $container = $("#requirementstextcontainer").first();
	if (!$container.length) return null;

	const { textBlocks, courseBlocks } = parseRequirementContainer($, $container);
	const builderSections = flattenBuilderSections(courseBlocks);
	if (!textBlocks.length && !builderSections.length) return null;

	const specializations = extractSpecializationLines(textBlocks);
	const programName = pageTitle || normalizeText($("title").text()) || url;
	const type = classifyProgramType(url, programName);

	return {
		id: slugify(programName),
		name: programName,
		type,
		programUrl: url,
		requirementsUrl: `${url.replace(/#.*$/, "")}#requirementstextcontainer`,
		pageTitle: programName,
		specializations,
		builderSections,
		requirementCourseBlocks: courseBlocks,
		requirementTextRules: textBlocks,
	};
}

function dedupeByName(programs) {
	const byName = new Map();
	for (const program of programs) {
		const key = normalizeText(program.name).toLowerCase();
		const existing = byName.get(key);
		if (!existing) {
			byName.set(key, program);
			continue;
		}

		const existingScore =
			(existing.builderSections?.length || 0) + (existing.requirementTextRules?.length || 0);
		const nextScore =
			(program.builderSections?.length || 0) + (program.requirementTextRules?.length || 0);
		if (nextScore > existingScore) {
			byName.set(key, program);
		}
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const results = [];
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const current = nextIndex;
			nextIndex += 1;
			try {
				const mapped = await mapper(items[current], current);
				if (mapped) results.push(mapped);
			} catch (error) {
				console.warn(`[warn] failed: ${items[current]} :: ${error.message}`);
			}
		}
	}

	const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
	await Promise.all(workers);
	return results;
}

async function main() {
	const args = parseArgs(process.argv);
	console.log("[info] loading sitemap...");

	const sitemapXml = await fetchText(SITEMAP_URL);
	const allUrls = extractSitemapUrls(sitemapXml);
	const candidateUrls = allUrls.filter(isProgramUrl);
	const targetUrls = args.maxPrograms > 0 ? candidateUrls.slice(0, args.maxPrograms) : candidateUrls;

	console.log(`[info] found ${candidateUrls.length} major/minor URLs`);
	console.log(`[info] scraping ${targetUrls.length} pages with concurrency=${args.concurrency}`);

	const scraped = await mapWithConcurrency(targetUrls, args.concurrency, scrapeProgram);
	const programs = dedupeByName(scraped);

	const majorCount = programs.filter((p) => p.type === "major").length;
	const minorCount = programs.filter((p) => p.type === "minor").length;

	const payload = {
		meta: {
			source: SITEMAP_URL,
			generatedAt: new Date().toISOString(),
			totalInputUrls: targetUrls.length,
			totalPrograms: programs.length,
			majorCount,
			minorCount,
		},
		programs,
	};

	fs.mkdirSync(path.dirname(args.output), { recursive: true });
	fs.writeFileSync(args.output, JSON.stringify(payload, null, 2), "utf8");

	console.log("[info] done");
	console.log(JSON.stringify(payload.meta, null, 2));
	console.log(`[info] wrote ${args.output}`);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
