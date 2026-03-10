#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, TypedDict, Union

COURSE_CODE_RE = re.compile(r"^[A-Z]{3,4}\s*\d{3}[A-Z]?$")
COURSE_TOKEN_RE = re.compile(r"^(?:or\s+|and\s+)?([A-Z]{2,6}(?:/[A-Z]{2,6})?\s*\d{3}[A-Z]?)$", re.IGNORECASE)
LEADING_CONNECTOR_RE = re.compile(r"^(or|and)\s+", re.IGNORECASE)
CHOOSE_COUNT_RE = re.compile(
    r"\b(?:select|choose)\s+(?:(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b)",
    re.IGNORECASE,
)
CHOICE_HEADER_RE = re.compile(r"\b(select|choose)\b", re.IGNORECASE)
CONNECTOR_ONLY_RE = re.compile(r"^(and|or|and/or)$", re.IGNORECASE)

NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


class BuilderCourse(TypedDict):
    code: str


class BuilderGroup(TypedDict):
    type: str
    items: List[Union["BuilderCourse", "BuilderGroup"]]


BuilderItem = Union[BuilderCourse, BuilderGroup]


class BuilderSection(TypedDict, total=False):
    title: str
    requirementType: str
    chooseCount: int
    items: List[BuilderItem]
    rules: List[str]

EXCLUDED_PATH_SEGMENTS = {
    "/approved-courses/",
    "/undergraduate/programs",
    "/courses/",
    "/academic-calendar/",
    "/faculty-staff/",
    "/archive/",
}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value


def classify_program(program_name: str, page_title: str, url: str) -> Optional[str]:
    blob = f"{program_name} {page_title} {url}".lower()
    if " minor" in blob or "/minor" in blob:
        return "minor"
    if " major" in blob or "/major" in blob:
        return "major"
    return None


def is_likely_program_page(url: str, page_title: str) -> bool:
    lower_url = url.lower()
    lower_title = (page_title or "").lower()

    if "/undergraduate/" not in lower_url:
        return False

    # Program pages are expected under colleges-schools; this avoids broad index pages.
    if "/undergraduate/colleges-schools/" not in lower_url:
        return False

    if any(segment in lower_url for segment in EXCLUDED_PATH_SEGMENTS):
        return False

    if lower_title in {"undergraduate", "undergraduate programs", "approved courses"}:
        return False

    return True


def parse_count_token(token: str) -> Optional[int]:
    token = token.strip().lower()
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS.get(token)


def parse_choose_count(text: str) -> Optional[int]:
    match = CHOOSE_COUNT_RE.search(text)
    if not match:
        return None
    return parse_count_token(match.group(1))


def normalize_course_code(raw: str) -> Optional[Tuple[str, Optional[str]]]:
    text = (raw or "").strip()
    if not text:
        return None

    # Keep standalone boolean rows separate from course rows.
    if CONNECTOR_ONLY_RE.match(text):
        return None

    connector_match = LEADING_CONNECTOR_RE.match(text)
    connector = connector_match.group(1).lower() if connector_match else None
    candidate = LEADING_CONNECTOR_RE.sub("", text).strip()

    token_match = COURSE_TOKEN_RE.match(text)
    if token_match:
        candidate = token_match.group(1).strip()

    # Canonical formatting (e.g. "CMSC 131" -> "CMSC131").
    candidate = candidate.upper().replace(" ", "")

    # Keep slash cross-lists intact ("AGNR/PLCY301").
    if re.match(r"^[A-Z]{2,6}(?:/[A-Z]{2,6})?\d{3}[A-Z]?$", candidate):
        return candidate, connector

    return None


def parse_row_kind(row: Dict[str, Any]) -> Dict[str, Any]:
    code_raw = (row.get("course_code") or "").strip()
    title = (row.get("title") or "").strip()
    credits = (row.get("credits") or "").strip() if row.get("credits") else None
    combined = " ".join(part for part in [code_raw, title] if part).strip()

    if not combined:
        return {"kind": "empty"}

    lower_combined = combined.lower()
    lower_code = code_raw.lower()

    if lower_code.startswith("total credits") or lower_combined.startswith("total credits"):
        return {"kind": "total", "text": combined, "credits": credits}

    if CONNECTOR_ONLY_RE.match(code_raw):
        return {"kind": "connector", "connector": code_raw.lower()}

    course_parsed = normalize_course_code(code_raw)
    if course_parsed:
        course_code, connector = course_parsed
        return {
            "kind": "course",
            "courseCode": course_code,
            "title": title,
            "credits": credits,
            "connector": connector,
        }

    choose_count = parse_choose_count(combined)
    if CHOICE_HEADER_RE.search(combined):
        return {
            "kind": "choice_header",
            "text": combined,
            "chooseCount": choose_count,
            "credits": credits,
        }

    return {
        "kind": "label",
        "text": combined,
        "credits": credits,
    }


def group_items_from_sequence(sequence: List[Tuple[str, BuilderCourse]]) -> List[BuilderItem]:
    """
    Build nested builder groups with simple precedence:
    - contiguous OR items become OR group
    - AND splits OR groups and keeps them as sibling required items
    """
    if not sequence:
        return []

    and_chunks: List[List[BuilderCourse]] = [[]]
    for connector, course in sequence:
        if connector == "and" and and_chunks[-1]:
            and_chunks.append([course])
            continue
        and_chunks[-1].append(course)

    items: List[BuilderItem] = []
    for chunk in and_chunks:
        if len(chunk) == 1:
            items.append(chunk[0])
        else:
            items.append({"type": "OR", "items": chunk})
    return items


def builder_sections_from_block_rows(rows: List[Dict[str, Any]], block_index: int) -> List[BuilderSection]:
    sections: List[BuilderSection] = []
    current_section: Optional[BuilderSection] = None
    sequence: List[Tuple[str, BuilderCourse]] = []

    def flush_sequence() -> None:
        nonlocal sequence, current_section
        if not current_section:
            return
        grouped_items = group_items_from_sequence(sequence)
        if grouped_items:
            current_section.setdefault("items", [])
            current_section["items"].extend(grouped_items)
        sequence = []

    def ensure_section(default_title: str) -> BuilderSection:
        nonlocal current_section
        if current_section is None:
            current_section = {
                "title": default_title,
                "requirementType": "all",
                "items": [],
                "rules": [],
            }
            sections.append(current_section)
        return current_section

    for row in rows:
        parsed = parse_row_kind(row)
        kind = parsed["kind"]

        if kind == "empty":
            continue

        if kind == "total":
            flush_sequence()
            section = ensure_section(f"Requirement Block {block_index + 1}")
            section.setdefault("rules", []).append(parsed["text"])
            continue

        if kind in {"label", "choice_header"}:
            flush_sequence()

            text = parsed["text"]
            # Start a new section when we see a clear heading-like row.
            looks_like_heading = (
                kind == "choice_header"
                or text.endswith(":")
                or (parsed.get("credits") is not None and not text.lower().startswith("or "))
            )

            if looks_like_heading:
                section_type = "choose" if kind == "choice_header" else "all"
                new_section: BuilderSection = {
                    "title": text.rstrip(":"),
                    "requirementType": section_type,
                    "items": [],
                    "rules": [],
                }
                choose_count = parsed.get("chooseCount")
                if section_type == "choose" and choose_count:
                    new_section["chooseCount"] = choose_count
                sections.append(new_section)
                current_section = new_section
            else:
                section = ensure_section(f"Requirement Block {block_index + 1}")
                section.setdefault("rules", []).append(text)
            continue

        if kind == "connector":
            # Connector-only rows affect the next course when present.
            if current_section is None:
                ensure_section(f"Requirement Block {block_index + 1}")
            if sequence:
                # Keep marker by appending a no-op; next course will start a new chunk on AND.
                # OR marker is already default behavior.
                sequence.append((parsed["connector"], {"code": ""}))
            continue

        if kind == "course":
            section = ensure_section(f"Requirement Block {block_index + 1}")
            connector = parsed.get("connector") or "or"

            # Remove any connector-only placeholder.
            while sequence and sequence[-1][1].get("code") == "":
                connector = sequence[-1][0]
                sequence.pop()

            course_item: BuilderCourse = {"code": parsed["courseCode"]}
            sequence.append((connector, course_item))

            title = parsed.get("title")
            if title:
                section.setdefault("rules", []).append(f"{parsed['courseCode']}: {title}")
            continue

    flush_sequence()

    # Clean empty placeholder sections.
    cleaned: List[BuilderSection] = []
    for section in sections:
        items = section.get("items", [])
        rules = section.get("rules", [])
        if items or rules:
            cleaned.append(section)
    return cleaned


def normalize_course_blocks(course_blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for idx, block in enumerate(course_blocks):
        rows = block.get("rows") or []
        parsed_rows: List[Dict[str, Any]] = []
        for row in rows:
            code = (row.get("course_code") or "").strip().upper().replace("  ", " ")
            title = (row.get("title") or "").strip()
            credits = (row.get("credits") or "").strip() if row.get("credits") else None

            # Keep course rows with broader formats used by catalog export.
            parsed_course = normalize_course_code(code)
            if not parsed_course:
                continue

            canonical_code, _ = parsed_course
            parsed_rows.append(
                {
                    "courseCode": canonical_code,
                    "title": title,
                    "credits": credits,
                }
            )

        builder_sections = builder_sections_from_block_rows(rows, idx)

        if parsed_rows or builder_sections:
            normalized.append(
                {
                    "kind": block.get("kind") or "course_list_table",
                    "courses": parsed_rows,
                    "builderSections": builder_sections,
                }
            )

    return normalized


def extract_specialization_lines(text_blocks: List[str]) -> List[str]:
    out: List[str] = []
    pattern = re.compile(r"\b(specialization|track|concentration|option)\b", re.IGNORECASE)
    for line in text_blocks:
        if pattern.search(line):
            out.append(line.strip())
    return out


def extract_specialization_options(course_blocks: List[Dict[str, Any]]) -> List[str]:
    options: List[str] = []
    for block in course_blocks:
        for row in block.get("rows") or []:
            parsed = parse_row_kind(row)
            if parsed["kind"] == "label":
                text = parsed.get("text", "")
                lower_text = text.lower()
                if (
                    text
                    and not text.endswith(":")
                    and not CHOICE_HEADER_RE.search(text)
                    and "specialization" not in lower_text
                    and "requirement" not in lower_text
                    and "total credits" not in lower_text
                    and "course" not in lower_text
                ):
                    # Heuristic: short standalone labels within specialization tables are options.
                    if len(text.split()) <= 8 and text not in options:
                        options.append(text)
    return options


def flatten_builder_sections(course_blocks: List[Dict[str, Any]]) -> List[BuilderSection]:
    sections: List[BuilderSection] = []
    for block in course_blocks:
        for section in block.get("builderSections", []):
            sections.append(section)
    return sections


def transform_record(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    name = (record.get("program_name") or "").strip()
    program_url = (record.get("program_url") or "").strip()
    req = record.get("requirements") or {}
    page_title = (req.get("page_title") or "").strip()
    requirements_url = (req.get("requirements_url") or program_url).strip()

    canonical_url = requirements_url or program_url
    if not name or not canonical_url:
        return None

    if not is_likely_program_page(canonical_url, page_title):
        return None

    text_blocks = [t.strip() for t in (req.get("text_blocks") or []) if t and t.strip()]
    raw_course_blocks = req.get("course_blocks") or []
    course_blocks = normalize_course_blocks(raw_course_blocks)

    if not course_blocks and not text_blocks:
        return None

    program_type = classify_program(name, page_title, canonical_url)
    if program_type is None:
        return None

    builder_sections = flatten_builder_sections(course_blocks)
    specialization_lines = extract_specialization_lines(text_blocks)

    specialization_options = extract_specialization_options(raw_course_blocks)
    specialization_sections = [
        section
        for section in builder_sections
        if "special" in section.get("title", "").lower()
        or "track" in section.get("title", "").lower()
        or "concentration" in section.get("title", "").lower()
    ]
    if not specialization_sections and (specialization_options or specialization_lines):
        # Fallback: expose structured sections so specialization builders can still auto-populate.
        specialization_sections = builder_sections

    return {
        "id": slugify(name),
        "name": name,
        "type": program_type,
        "programUrl": program_url,
        "requirementsUrl": requirements_url,
        "pageTitle": page_title,
        "specializations": specialization_lines,
        "builderSections": builder_sections,
        "builderSpecializations": {
            "options": specialization_options,
            "rules": specialization_lines,
            "sections": specialization_sections,
        },
        "requirementCourseBlocks": course_blocks,
        "requirementTextRules": text_blocks,
    }


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                items.append(obj)
    return items


def dedupe_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_name: Dict[str, Dict[str, Any]] = {}
    for program in programs:
        key = program["name"].lower().strip()
        existing = by_name.get(key)
        if not existing:
            by_name[key] = program
            continue

        score_existing = len(existing.get("requirementCourseBlocks", [])) + len(existing.get("requirementTextRules", []))
        score_new = len(program.get("requirementCourseBlocks", [])) + len(program.get("requirementTextRules", []))
        if score_new > score_existing:
            by_name[key] = program

    return sorted(by_name.values(), key=lambda p: p["name"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Transform UMD requirements JSONL into site-ready JSON.")
    parser.add_argument("--input", default="umd_requirements.jsonl", help="Input JSONL path")
    parser.add_argument(
        "--output",
        default="../site/src/lib/data/umd_program_requirements.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    records = load_jsonl(input_path)
    transformed = [t for t in (transform_record(r) for r in records) if t is not None]
    programs = dedupe_programs(transformed)

    major_count = sum(1 for p in programs if p["type"] == "major")
    minor_count = sum(1 for p in programs if p["type"] == "minor")

    payload = {
        "meta": {
            "source": str(input_path),
            "totalInputRows": len(records),
            "totalPrograms": len(programs),
            "majorCount": major_count,
            "minorCount": minor_count,
        },
        "programs": programs,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(payload["meta"], indent=2))
    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
