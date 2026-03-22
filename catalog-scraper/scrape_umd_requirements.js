#!/usr/bin/env node

// npm run scrape:requirements -- --output site/src/lib/data/current_degree_requirements_umd.json

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

const EXCLUDED_PATH_SEGMENTS = [
	"/approved-courses/",
	"/undergraduate/programs",
	"/courses/",
	"/academic-calendar/",
	"/faculty-staff/",
	"/archive/",
];

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
	if (EXCLUDED_PATH_SEGMENTS.some((segment) => lower.includes(segment))) return false;
	return true;
}

function classifyProgramType(url, title) {
	const lower = `${url} ${title}`.toLowerCase();
	if (lower.includes("-minor/") || /\bminor\b/.test(lower)) return "minor";
	if (lower.includes("-major/") || /\bmajor\b/.test(lower)) return "major";
	return null;
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

function extractAllCourseCodes(raw) {
	const text = normalizeText(raw).toUpperCase();
	if (!text) return [];
	const matches = text.match(/[A-Z]{2,6}(?:\/[A-Z]{2,6})?\s*(?:\d{3}[A-Z]?|[1-4]XX|XXX)/g) || [];
	const normalized = matches.map((token) => normalizeText(token).replace(/\s+/g, ""));
	return [...new Set(normalized)];
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

	const allCourseCodes = extractAllCourseCodes(codeRaw);
	if (allCourseCodes.length > 0) {
		const connectorMatch = codeRaw.match(/^(or|and)\s+/i);
		return {
			kind: "course",
			courseCode: allCourseCodes[0],
			courseCodes: allCourseCodes,
			connector: connectorMatch ? connectorMatch[1].toLowerCase() : null,
			title,
			credits,
		};
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

function shouldInlineChoiceHeader(rows, startIndex) {
	let sawCreditedCourse = false;
	let sawBlankCreditCourse = false;

	for (let index = startIndex + 1; index < rows.length; index += 1) {
		const parsed = parseRowKind(rows[index]);
		const kind = parsed.kind;

		if (kind === "empty" || kind === "connector") continue;
		if (kind === "total" || kind === "label" || kind === "choice_header") break;
		if (kind !== "course") break;

		if (parsed.credits) {
			sawCreditedCourse = true;
			continue;
		}

		if (sawCreditedCourse) {
			sawBlankCreditCourse = true;
		}
	}

	return sawCreditedCourse && sawBlankCreditCourse;
}

function builderSectionsFromRows(rows, blockIndex) {
	const sections = [];
	let currentSection = null;
	let pendingConnector = null;

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

	function appendToAllSection(section, courseCode, connector, credits) {
		const lastItem = section.items[section.items.length - 1] || null;
		const mergeIntoPrevious =
			connector === "or" ||
			(!credits &&
				lastItem &&
				(
					(typeof lastItem.code === "string" && lastItem.code) ||
					(lastItem.type === "OR" && Array.isArray(lastItem.items) && lastItem.items.length > 0)
				));

		if (!mergeIntoPrevious) {
			section.items.push({ code: courseCode });
			return;
		}

		if (lastItem.type === "OR" && Array.isArray(lastItem.items)) {
			if (!lastItem.items.some((item) => item.code === courseCode)) {
				lastItem.items.push({ code: courseCode });
			}
			return;
		}

		if (typeof lastItem.code === "string" && lastItem.code) {
			section.items[section.items.length - 1] = {
				type: "OR",
				items: [{ code: lastItem.code }, { code: courseCode }],
			};
			return;
		}

		section.items.push({ code: courseCode });
	}

	function appendToChooseSection(section, courseCode) {
		const lastItem = section.items[section.items.length - 1] || null;
		if (lastItem && lastItem.type === "OR" && Array.isArray(lastItem.items)) {
			if (!lastItem.items.some((item) => item.code === courseCode)) {
				lastItem.items.push({ code: courseCode });
			}
			return;
		}

		section.items.push({ type: "OR", items: [{ code: courseCode }] });
	}

	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex];
		const parsed = parseRowKind(row);
		const kind = parsed.kind;

		if (kind === "empty") continue;

		if (kind === "total") {
			pendingConnector = null;
			ensureSection(`Requirement Block ${blockIndex + 1}`).rules.push(parsed.text);
			continue;
		}

		if (kind === "label" || kind === "choice_header") {
			pendingConnector = null;
			const text = parsed.text;
			const looksLikeHeading =
				kind === "choice_header" ||
				text.endsWith(":") ||
				(parsed.credits !== null && !text.toLowerCase().startsWith("or "));

			if (looksLikeHeading) {
				if (
					kind === "choice_header" &&
					currentSection &&
					currentSection.requirementType === "all" &&
					shouldInlineChoiceHeader(rows, rowIndex)
				) {
					continue;
				}

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
			pendingConnector = parsed.connector;
			continue;
		}

		if (kind === "course") {
			const section = ensureSection(`Requirement Block ${blockIndex + 1}`);
			const connector = parsed.connector || pendingConnector || null;
			pendingConnector = null;
			const courseCodes = Array.isArray(parsed.courseCodes) && parsed.courseCodes.length > 0
				? parsed.courseCodes
				: [parsed.courseCode];

			if (section.requirementType === "choose") {
				for (const code of courseCodes) {
					appendToChooseSection(section, code);
				}
			} else {
				for (let codeIndex = 0; codeIndex < courseCodes.length; codeIndex += 1) {
					appendToAllSection(
						section,
						courseCodes[codeIndex],
						codeIndex === 0 ? connector : "and",
						parsed.credits,
					);
				}
			}

			if (parsed.title) {
				section.rules.push(`${courseCodes[0]}: ${parsed.title}`);
			}
		}
	}

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
			const allCodes = extractAllCourseCodes(row.course_code);
			if (!allCodes.length) continue;
			for (const courseCode of allCodes) {
				courses.push({
					courseCode,
					title: row.title || "",
					credits: row.credits || null,
				});
			}
		}

		courseBlocks.push({
			kind: "course_list_table",
			courses,
			builderSections: normalizeBuilderSections(builderSectionsFromRows(rows, tableIndex)),
		});
	});

	return { textBlocks, courseBlocks };
}

function extractCourseCodesFromText(text) {
	const matches = normalizeText(text).toUpperCase().match(/\b[A-Z]{4}\d{3}[A-Z]?\b/g);
	return matches ? [...new Set(matches)] : [];
}

function looksLikeCourseListTitle(title) {
	const normalized = normalizeText(title);
	if (!normalized) return false;
	return /^([A-Z]{4}\d{3}[A-Z]?)(\s*&\s*[A-Z]{4}\d{3}[A-Z]?)+\b/.test(normalized);
}

function isGenericRequirementBlockTitle(title) {
	return /^Requirement Block\s+\d+$/i.test(normalizeText(title));
}

function headingLikeRuleText(rules) {
	for (const raw of rules || []) {
		const rule = normalizeText(raw);
		if (!rule) continue;
		if (rule.includes(":")) continue;
		if (/\b[A-Z]{4}\d{3}[A-Z]?\b/.test(rule)) continue;
		if (/\b(total credits?|courses a-z|approved courses|undergraduate|graduate)\b/i.test(rule)) continue;
		return rule;
	}
	return null;
}

function flattenItemCodes(items) {
	const out = [];
	for (const item of items || []) {
		if (!item || typeof item !== "object") continue;
		if (typeof item.code === "string" && item.code) {
			out.push(item.code.toUpperCase());
		}
		if (item.type === "OR" && Array.isArray(item.items)) {
			for (const option of item.items) {
				if (option?.code) out.push(String(option.code).toUpperCase());
			}
		}
	}
	return [...new Set(out)];
}

function mergeSectionItems(primaryItems, incomingItems) {
	const existingCodes = new Set(flattenItemCodes(primaryItems));
	const merged = [...(primaryItems || [])];

	for (const item of incomingItems || []) {
		if (!item || typeof item !== "object") continue;
		if (typeof item.code === "string" && item.code) {
			const code = item.code.toUpperCase();
			if (!existingCodes.has(code)) {
				merged.push({ code });
				existingCodes.add(code);
			}
			continue;
		}
		if (item.type === "OR" && Array.isArray(item.items)) {
			const options = [];
			for (const option of item.items) {
				const code = option?.code ? String(option.code).toUpperCase() : "";
				if (!code || existingCodes.has(code)) continue;
				options.push({ code });
				existingCodes.add(code);
			}
			if (options.length === 1) merged.push(options[0]);
			else if (options.length > 1) merged.push({ type: "OR", items: options });
		}
	}

	return merged;
}

function sectionSignature(section) {
	const codes = flattenItemCodes(section.items).sort().join("|");
	const title = normalizeText(section.title).toLowerCase();
	return `${title}::${section.requirementType || "all"}::${section.chooseCount || ""}::${codes}`;
}

function normalizeBuilderSections(sections) {
	const merged = [];

	for (const sourceSection of sections || []) {
		const section = {
			title: normalizeText(sourceSection.title),
			requirementType: sourceSection.requirementType || "all",
			items: [...(sourceSection.items || [])],
			rules: [...(sourceSection.rules || [])],
			...(typeof sourceSection.chooseCount === "number" ? { chooseCount: sourceSection.chooseCount } : {}),
		};

		if (looksLikeCourseListTitle(section.title)) {
			const titleCodes = extractCourseCodesFromText(section.title);
			const existingCodes = new Set(flattenItemCodes(section.items));
			for (const code of titleCodes) {
				if (!existingCodes.has(code)) {
					section.items.push({ code });
					existingCodes.add(code);
				}
			}

			if (merged.length > 0) {
				const previous = merged[merged.length - 1];
				const previousHeading = headingLikeRuleText(previous.rules || []);
				const shouldMerge =
					isGenericRequirementBlockTitle(previous.title) ||
					/foundation|required courses?/i.test(previous.title) ||
					Boolean(previousHeading && /foundation|required courses?/i.test(previousHeading));

				if (shouldMerge) {
					previous.items = mergeSectionItems(previous.items, section.items);
					previous.rules = [...new Set([...(previous.rules || []), ...(section.rules || [])])];
					continue;
				}
			}
		}

		merged.push(section);
	}

	const deduped = new Map();
	for (const section of merged) {
		const signature = sectionSignature(section);
		if (!deduped.has(signature)) {
			deduped.set(signature, section);
			continue;
		}

		const existing = deduped.get(signature);
		existing.items = mergeSectionItems(existing.items, section.items);
		existing.rules = [...new Set([...(existing.rules || []), ...(section.rules || [])])];
	}

	return [...deduped.values()].map((section) => {
		if (!isGenericRequirementBlockTitle(section.title)) return section;
		const heading = headingLikeRuleText(section.rules || []);
		if (!heading) return section;
		return {
			...section,
			title: heading,
		};
	});
}

function flattenBuilderSections(courseBlocks) {
	const sections = [];
	for (const block of courseBlocks) {
		for (const section of block.builderSections || []) {
			sections.push(section);
		}
	}
	return normalizeBuilderSections(sections);
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
	const flattenedBuilderSections = flattenBuilderSections(courseBlocks);
	if (!textBlocks.length && !flattenedBuilderSections.length) return null;

	const specializations = extractSpecializationLines(textBlocks);
	const programName = pageTitle || normalizeText($("title").text()) || url;
	const type = classifyProgramType(url, programName);
	if (!type) return null;

	return {
		id: slugify(programName),
		name: programName,
		type,
		programUrl: url,
		requirementsUrl: `${url.replace(/#.*$/, "")}#requirementstextcontainer`,
		pageTitle: programName,
		specializations,
		builderSections: courseBlocks.length > 0 ? [] : flattenedBuilderSections,
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
