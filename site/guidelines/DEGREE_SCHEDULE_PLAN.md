# OrbitUMD — Degree Requirements, Schedules, Four-Year Plans & Degree Audit

## Complete Implementation Plan

This document is the single source of truth for the end-to-end implementation of:

1. **Degree Requirements Builder** — creating, editing, and persisting nestable requirement trees per program.
2. **Schedule Builder** — saving schedule selections to the database and managing named schedules.
3. **Four-Year Plan** — selecting a primary schedule per term and mapping courses into a multi-year plan.
4. **Degree Audit** — evaluating a user's progress against their declared program requirements.

> **Guiding principle:** Integrate with existing tables rather than duplicating them. Every new table or column must earn its place.

---

## 1. Database Schema Extensions

### 1A. New table: `public.degree_requirement_sections`

Represents top-level labeled groupings within a degree program ("Required Lower Level Courses", "Upper Level Electives", etc.).

```sql
create table if not exists public.degree_requirement_sections (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.degree_programs(id) on delete cascade,
  title         text not null,
  section_type  text not null default 'all_required'
                  check (section_type in ('all_required', 'choose_n')),
  min_count     int,            -- required when section_type = 'choose_n'
  min_credits   numeric(4,2),   -- optional credit-based threshold
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_dreq_sections_program on public.degree_requirement_sections(program_id, position);
```

### 1B. New table: `public.degree_requirement_nodes`

A recursive adjacency-list tree representing the nestable boolean logic inside each section.

```sql
create table if not exists public.degree_requirement_nodes (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references public.degree_requirement_sections(id) on delete cascade,
  parent_id     uuid references public.degree_requirement_nodes(id) on delete cascade,
  node_type     text not null
                  check (node_type in ('AND_GROUP','OR_GROUP','COURSE','GEN_ED','WILDCARD')),
  -- For COURSE nodes:
  course_code   text,           -- e.g. 'CMSC330' — maps to public.courses.umd_course_id
  course_id     uuid references public.courses(id) on delete set null,
  -- For GEN_ED nodes:
  gen_ed_code   text references public.gen_ed_tags(code) on delete set null,
  -- For WILDCARD nodes (e.g. "any 300-level CMSC"):
  wildcard_dept text,
  wildcard_level text,           -- e.g. '3__' for 300-level
  -- Group semantics:
  min_count     int,            -- for group nodes acting as 'choose N from children'
  min_credits   numeric(4,2),   -- optional credit-based threshold on group
  position      int not null default 0,
  label         text,           -- optional display label for groups
  created_at    timestamptz not null default now()
);

create index idx_dreq_nodes_section on public.degree_requirement_nodes(section_id);
create index idx_dreq_nodes_parent on public.degree_requirement_nodes(parent_id);
create index idx_dreq_nodes_course on public.degree_requirement_nodes(course_id) where course_id is not null;
```

### 1C. Extend `public.plan_terms` with optional primary schedule link

```sql
alter table public.plan_terms
  add column if not exists primary_schedule_id uuid
    references public.user_schedules(id) on delete set null;
```

### 1D. New table: `public.user_prior_credits`

For imported AP/IB/transfer credits that don't map to UMD sections but count toward requirements.

```sql
create table if not exists public.user_prior_credits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  source_type     text not null check (source_type in ('AP','IB','transfer','exemption','other')),
  original_name   text not null,
  umd_course_code text,         -- optional mapping to catalog course
  course_id       uuid references public.courses(id) on delete set null,
  credits         numeric(4,2) not null,
  gen_ed_codes    text[] not null default '{}',
  term_awarded    text,         -- e.g. 'Fall 2024' or 'Pre-enrollment'
  created_at      timestamptz not null default now()
);

create index idx_user_prior_credits_user on public.user_prior_credits(user_id);
```

### 1E. RLS policies for new tables

```sql
-- degree_requirement_sections: readable by all, writable by authenticated users
alter table public.degree_requirement_sections enable row level security;
create policy "dreq sections readable" on public.degree_requirement_sections for select using (true);
create policy "dreq sections writable" on public.degree_requirement_sections for all
  using (true) with check (true); -- tighten to admin role when ready

-- degree_requirement_nodes: same pattern
alter table public.degree_requirement_nodes enable row level security;
create policy "dreq nodes readable" on public.degree_requirement_nodes for select using (true);
create policy "dreq nodes writable" on public.degree_requirement_nodes for all
  using (true) with check (true);

-- user_prior_credits: user manages own
alter table public.user_prior_credits enable row level security;
create policy "users manage own prior credits" on public.user_prior_credits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 1F. Relationship to existing tables

- `public.degree_programs` — unchanged; parent of sections.
- `public.degree_requirements` — becomes a higher-level summary/label pointing at sections. Keep for backward compat; the builder writes to sections + nodes.
- `public.requirement_course_rules` / `public.requirement_gen_ed_rules` — existing rows can be kept for simple programs; the node tree supersedes them for complex programs.
- `public.user_degree_programs` — unchanged; links users to programs.
- `public.user_requirement_progress_overrides` — unchanged; evaluator reads `is_waived` per requirement; extend to also reference `section_id` or `node_id` if needed:

```sql
alter table public.user_requirement_progress_overrides
  add column if not exists section_id uuid references public.degree_requirement_sections(id) on delete cascade,
  add column if not exists node_id uuid references public.degree_requirement_nodes(id) on delete cascade;
```

---

## 2. Degree Requirements Builder — Full Behaviors

### 2A. Data loading

When the builder page mounts with a selected program:

1. Fetch `degree_programs` row by ID (or by `program_code`).
2. Fetch all `degree_requirement_sections` for that `program_id`, ordered by `position`.
3. For each section, fetch all `degree_requirement_nodes` where `section_id = section.id`.
4. Build a client-side tree: group nodes by `parent_id`, sort by `position`, recurse.
5. Populate the existing `Section[]` + `(Course | CourseGroup)[]` state from this tree.

### 2B. Client-side data model (TypeScript)

```ts
// site/src/lib/types/requirements.ts

export interface RequirementSection {
  id?: string;                    // uuid from DB; undefined for new sections
  programId: string;
  title: string;
  sectionType: 'all_required' | 'choose_n';
  minCount?: number;
  minCredits?: number;
  position: number;
  nodes: RequirementNode[];       // root-level nodes in this section
}

export type NodeType = 'AND_GROUP' | 'OR_GROUP' | 'COURSE' | 'GEN_ED' | 'WILDCARD';

export interface RequirementNode {
  id?: string;                    // uuid from DB
  sectionId?: string;
  parentId?: string | null;
  nodeType: NodeType;
  // COURSE
  courseCode?: string;
  courseId?: string;
  // GEN_ED
  genEdCode?: string;
  // WILDCARD
  wildcardDept?: string;
  wildcardLevel?: string;
  // GROUP
  minCount?: number;
  minCredits?: number;
  label?: string;
  position: number;
  children: RequirementNode[];    // populated client-side from parent_id links
}
```

### 2C. Repository layer

Create `site/src/lib/repositories/degreeRequirementsRepository.ts`:

```
Functions:
- fetchProgramWithSections(programId: string): Promise<{ program, sections[] }>
- fetchNodesForSection(sectionId: string): Promise<RequirementNodeRow[]>
- saveSections(programId: string, sections: RequirementSection[]): Promise<void>
    - Transactional: delete removed sections/nodes, upsert new/updated ones.
    - Use Supabase RPC or sequential deletes + inserts wrapped in a single request batch.
- deleteSectionCascade(sectionId: string): Promise<void>
```

### 2D. Saving strategy

1. Diff current client tree against last-loaded snapshot.
2. Collect: new sections, updated sections, deleted section IDs.
3. For each section, collect: new nodes, updated nodes, deleted node IDs.
4. Execute in order:
   a. Delete removed nodes (cascade handles children).
   b. Delete removed sections.
   c. Upsert sections (insert new, update existing title/type/position).
   d. Upsert nodes top-down (parents before children so `parent_id` FK is satisfied).
5. Store `updated_at` on sections; on save, check that `updated_at` matches loaded value to detect conflicts.

### 2E. Validation before save

- Every `choose_n` section/group must have `minCount > 0` and `minCount <= children.length`.
- No cycles (guaranteed by tree structure with parent_id; enforce on client by never allowing a node to be dropped into its own subtree — already handled by existing DnD guard).
- Course nodes should have a valid `courseCode` (non-empty string matching `[A-Z]{4}\d{3}[A-Z]?`).
- Gen Ed nodes should have a valid `genEdCode` from `public.gen_ed_tags`.

### 2F. Course autocomplete

Replace the current free-text `<Input>` for course codes with a searchable autocomplete:
- On input, query `public.catalog_courses_v` (or use existing `searchCoursesWithStrategy`) filtered by prefix.
- Show dropdown with `course_code — name (credits cr)`.
- On select, populate `courseCode` and resolve `courseId` from `public.courses`.

---

## 3. Schedule Builder — Persistent Schedules

### 3A. Current state

The `CoursePlannerPage` (schedule builder) uses a Zustand store (`coursePlannerStore`) with:
- `selections: Record<string, ScheduleSelection>` — in-memory map of selected course/section pairs.
- No current integration with `public.user_schedules` or `public.schedule_sections`.

### 3B. Required integration

#### Save schedule flow:
1. User clicks **Save Schedule** button (new UI element to add).
2. Prompt for schedule name (or auto-name like "Spring 2026 Schedule 1").
3. Call `upsertUserSchedule({ termId, name, isPrimary: false })` → get `scheduleId`.
4. Resolve each `ScheduleSelection.section` to a `public.sections.id`:
   - The planner currently operates on API-fetched `Section` objects with composite IDs.
   - Need a mapping step: for each selected section, look up `public.sections` by `(offering_id, umd_section_id)` or `(course_code, section_code, term)`.
   - If not found in `public.sections` (because catalog sync hasn't run), insert a stub or skip.
5. Call `replaceScheduleSections(scheduleId, sectionIds)`.

#### Load schedule flow:
1. User clicks **Load Schedule** → show list from `listUserSchedules()` filtered by current term.
2. On select, call `listSectionsForSchedule(scheduleId)`.
3. For each `section_id`, resolve back to course + section data via catalog views.
4. Populate `selections` in the Zustand store.

#### Mark as primary:
1. Call `upsertUserSchedule({ id: scheduleId, termId, name, isPrimary: true })`.
2. The DB's partial unique index enforces one primary per user+term.

### 3C. Bridging API sections ↔ DB sections

The planner fetches from Jupiter/UMD APIs with composite keys like `CMSC330-0201`. The database stores sections in `public.sections` with `uuid` IDs linked through `offerings`.

Create a resolution utility:
```
resolveDbSectionId(courseCode: string, sectionCode: string, termCode: string, year: number): Promise<string | null>
```
Query: `catalog_sections_v` by `(course_code, section_code, term_code, year)` → return `section_key`, then look up `public.sections` by matching `umd_section_id`.

If the app-layer `public.sections` table is not populated (only `orbit.sections` exists from sync), **use `orbit.sections.section_key`** as the canonical identifier and store it in `schedule_sections.section_id` after ensuring FK compatibility — or create corresponding `public.sections` rows on save.

**Recommended approach:** Add a `catalog_section_key` text column to `public.schedule_sections` as an alternative identifier, or populate `public.sections` from the orbit catalog during sync.

---

## 4. Four-Year Plan — Primary Schedule Selection

### 4A. Current state

`FourYearPlan.tsx` is a hardcoded UI with static semesters and courses. `fourYearPlansRepository.ts` has full CRUD for plans, plan_terms, and plan_term_courses — but nothing calls it from the page yet.

### 4B. Required behaviors

#### Plan initialization:
1. On mount, call `listFourYearPlans()`.
2. If none exist, create a default plan: `createFourYearPlan({ name: 'My Plan', startTermId, targetGraduationTermId })`.
3. Load plan terms via Supabase join: `plan_terms` with their `plan_term_courses`.

#### Term ↔ schedule binding:
1. For each `plan_term`, display a dropdown of the user's `user_schedules` for that term.
2. On selection, write `primary_schedule_id` to `plan_terms` (new column from §1C).
3. When a primary schedule is set:
   - Automatically populate `plan_term_courses` from `schedule_sections` → `sections` → `course_offerings` → `courses`.
   - Set `source_schedule_id` on each `plan_term_courses` row.
   - Set `status` = `'planned'` for future terms, `'in_progress'` for current term, `'completed'` for past terms.

#### Manual course additions:
- Users can also manually add courses to plan terms (not from a schedule).
- These have `source_schedule_id = null` and independently tracked status.

#### Reconciliation:
- If a schedule is changed (sections added/removed) after being linked to a plan term, the plan should detect staleness and offer to re-sync.

### 4C. Repository additions

Add to `fourYearPlansRepository.ts`:
```
- fetchPlanWithTermsAndCourses(planId): full plan load
- setPlanTermSchedule(planTermId, scheduleId): update primary_schedule_id
- syncPlanTermFromSchedule(planTermId, scheduleId): replace plan_term_courses from schedule's sections
```

---

## 5. Degree Audit — Evaluation Engine

### 5A. Inputs

The evaluator needs:

1. **Requirement tree** for a program (sections + nodes).
2. **User's completed courses**: from `plan_term_courses` with `status = 'completed'` + `user_prior_credits`.
3. **User's in-progress courses**: from `plan_term_courses` with `status = 'in_progress'` or current-term primary schedule sections.
4. **User's planned courses**: from `plan_term_courses` with `status = 'planned'` or future-term primary schedule sections.
5. **Gen Ed tags** per course: from `public.course_gen_ed_tags` or `catalog_courses_v.geneds`.
6. **User overrides**: from `user_requirement_progress_overrides` (is_waived, notes).

### 5B. Course record assembly

Create `site/src/lib/services/auditDataService.ts`:

```ts
export interface UserCourseRecord {
  courseCode: string;
  courseId?: string;
  credits: number;
  genEdCodes: string[];
  deptId: string;
  courseNumber: string;
  status: 'completed' | 'in_progress' | 'planned';
  term?: string;
  source: 'schedule' | 'plan' | 'prior_credit';
}

export async function assembleUserCourses(userId: string): Promise<UserCourseRecord[]>
```

This function:
1. Joins `plan_term_courses` → `courses` → `course_gen_ed_tags` for plan-based courses.
2. Joins primary schedule sections → `catalog_sections_v` → `catalog_courses_v` for schedule-based courses.
3. Reads `user_prior_credits` and maps them.
4. Deduplicates by `courseCode`, preferring highest-status source (completed > in_progress > planned).

### 5C. Recursive tree evaluator

Create `site/src/lib/services/requirementEvaluator.ts`:

```ts
export type SatisfactionStatus = 'satisfied' | 'in_progress' | 'planned' | 'not_started';

export interface NodeEvaluation {
  nodeId: string;
  nodeType: NodeType;
  status: SatisfactionStatus;
  satisfiedBy: UserCourseRecord[];   // which courses matched
  childEvaluations: NodeEvaluation[];
  // For groups:
  satisfiedCount: number;
  requiredCount: number;
  satisfiedCredits: number;
  requiredCredits?: number;
}

export interface SectionEvaluation {
  sectionId: string;
  title: string;
  sectionType: 'all_required' | 'choose_n';
  status: SatisfactionStatus;
  satisfiedCount: number;
  requiredCount: number;
  satisfiedCredits: number;
  requiredCredits?: number;
  nodeEvaluations: NodeEvaluation[];
}

export interface ProgramAudit {
  programId: string;
  programName: string;
  sections: SectionEvaluation[];
  overallStatus: SatisfactionStatus;
  totalRequiredCredits: number;
  totalSatisfiedCredits: number;
}

export function evaluateProgram(
  sections: RequirementSection[],
  userCourses: UserCourseRecord[],
  overrides: OverrideRecord[],
): ProgramAudit
```

#### Evaluation rules:

**Leaf nodes:**

- **COURSE node**: Find a `UserCourseRecord` where `courseCode` matches `node.courseCode`. Status follows the course's status. Mark the course as "consumed" for double-counting prevention.
- **GEN_ED node**: Find any unconsumed course tagged with `node.genEdCode`. If `min_count` is set on the node, need that many matching courses.
- **WILDCARD node**: Match courses where `deptId === node.wildcardDept` and `courseNumber` matches `node.wildcardLevel` pattern (e.g., `'3__'` → starts with '3').

**Group nodes:**

- **AND_GROUP**: All children must be satisfied → status = worst child status. If any child is `not_started`, group is `not_started`. If all satisfied, `satisfied`. Mixed = `in_progress`.
- **OR_GROUP**: At least one child (or `min_count` children if specified) must be satisfied → status = best qualifying child status.

**Section:**

- **all_required**: Equivalent to an implicit AND_GROUP over all root nodes.
- **choose_n**: At least `min_count` root nodes must be satisfied.

**Overrides:** If `is_waived = true` for a node or section, mark as `satisfied` regardless of course matching.

**Double-counting prevention:**
- Maintain a `Set<string>` of consumed course codes across the entire program evaluation.
- When a course satisfies a leaf node, add it to the consumed set.
- Subsequent nodes cannot claim the same course (unless the program explicitly allows sharing via a flag — future extension).
- Exception: gen ed requirements typically share courses with major requirements at UMD. Implement a `shared_with_gen_eds: boolean` flag on nodes/sections (default true for gen ed sections).

### 5D. Where to run the evaluator

**Client-side** for now (simpler, no RPC infrastructure needed):
1. Load full requirement tree.
2. Load assembled user courses.
3. Run `evaluateProgram()` in the browser.
4. Future optimization: Postgres function via `supabase.rpc()` for server-side evaluation to reduce data transfer.

---

## 6. Degree Audit Page — UI & Data Flow

### 6A. Replace hardcoded data

The current `DegreeAudit.tsx` has all static numbers and course lists. Replace with:

1. On mount:
   a. Fetch user's `user_degree_programs` (with joined `degree_programs` details).
   b. For each program, fetch requirement tree (sections + nodes).
   c. Assemble user courses via `assembleUserCourses()`.
   d. Run `evaluateProgram()` per program.
   e. Fetch `user_requirement_progress_overrides`.

2. Render dynamically:
   a. **Summary card**: Compute totals from evaluation results (completed credits, in-progress, remaining).
   b. **Per-program sections**: Iterate `ProgramAudit.sections`, render each with its tree.
   c. **Status badges**: Map `SatisfactionStatus` to colors (green/blue/amber/gray).
   d. **Course badges**: Show which courses satisfied each node, with term and status.
   e. **Override indicators**: Show waiver icon/note where overrides apply.

### 6B. Gen Ed section

Gen Ed requirements are modeled as a special `degree_program` (e.g., `program_code = 'UMD_GEN_ED'`) with sections for Fundamental Studies, Distributive Studies, and Diversity. The evaluator handles them identically to major/minor programs, but with `shared_with_gen_eds = true` so courses can double-count.

### 6C. State management

Create a Zustand store or use React Query for audit data:
```
degreeAuditStore:
  programs: UserDegreeProgram[]
  audits: Record<programId, ProgramAudit>
  loading: boolean
  error?: string
  refreshAudit(): Promise<void>
```

---

## 7. Credit Import Integration

### 7A. Current state

`CreditImport.tsx` has a form UI for adding prior credits but no persistence.

### 7B. Required integration

1. On save, write rows to `public.user_prior_credits`.
2. Resolve `umd_course_code` to `course_id` via `public.courses.umd_course_id`.
3. Resolve gen ed tags: if the mapped course has gen ed tags in `course_gen_ed_tags`, automatically populate `gen_ed_codes` on the prior credit row.
4. On load (returning user), fetch existing `user_prior_credits` and populate the form.
5. Prior credits feed into the audit evaluator via `assembleUserCourses()`.

---

## 8. Implementation Order

### Phase 1: Schema & Foundation
1. Write and apply the SQL migration for new tables (§1A–§1F).
2. Create TypeScript types for requirements (§2B).
3. Create repository layer for degree requirements (§2C).

### Phase 2: Degree Requirements Builder
4. Wire loading existing requirements into the builder UI.
5. Replace free-text course input with autocomplete (§2F).
6. Implement save/update logic (§2D) with validation (§2E).
7. Test round-trip: create → save → reload → edit → save.

### Phase 3: Schedule Persistence
8. Add Save/Load schedule buttons to `CoursePlannerPage`.
9. Implement section resolution bridge (§3C).
10. Wire `upsertUserSchedule` + `replaceScheduleSections` on save.
11. Wire `listUserSchedules` + `listSectionsForSchedule` on load.
12. Add "Mark as Primary" toggle.

### Phase 4: Four-Year Plan
13. Replace hardcoded `FourYearPlan.tsx` with dynamic data from repositories.
14. Implement plan initialization and term CRUD.
15. Add primary schedule dropdown per plan term (§4B).
16. Implement schedule-to-plan sync (§4C).

### Phase 5: Prior Credits
17. Wire `CreditImport.tsx` to `user_prior_credits` table.
18. Add gen ed tag auto-resolution on import.

### Phase 6: Audit Evaluator
19. Implement `assembleUserCourses()` (§5B).
20. Implement recursive `evaluateProgram()` (§5C).
21. Unit test evaluator with mock data covering:
    - Simple all-required sections.
    - Choose-N sections.
    - Nested AND/OR groups.
    - Gen ed matching.
    - Wildcard matching.
    - Override/waiver handling.
    - Double-counting prevention.

### Phase 7: Degree Audit UI
22. Replace `DegreeAudit.tsx` with dynamic rendering (§6A).
23. Wire gen ed section as a special program (§6B).
24. Add override display and edit capability.

### Phase 8: Polish
25. Add loading states and error boundaries to all pages.
26. Add optimistic updates where appropriate.
27. Performance: memoize evaluator results, add pagination for large requirement trees.
28. Tighten RLS on requirement tables to admin-only writes when auth roles are in place.

---

## 9. Key File Locations (Existing)

| Concern | File |
|---|---|
| Supabase client | `site/src/lib/supabase/client.ts` |
| Course types | `site/src/lib/types/course.ts` |
| Planner types | `site/src/features/coursePlanner/types/coursePlanner.ts` |
| Schedule repo | `site/src/lib/repositories/userSchedulesRepository.ts` |
| Plan repo | `site/src/lib/repositories/fourYearPlansRepository.ts` |
| Planner API facade | `site/src/lib/api/planner.ts` |
| Planner store | `site/src/features/coursePlanner/state/coursePlannerStore.ts` |
| Course search service | `site/src/features/coursePlanner/services/courseSearchService.ts` |
| DB schema (app) | `site/supabase/migrations/20260308224500_init_orbitumd.sql` |
| DB schema (orbit) | `site/supabase/migrations/20260309001000_orbit_catalog_schema.sql` |
| DegreeRequirement page | `site/src/app/pages/DegreeRequirement.tsx` |
| DegreeAudit page | `site/src/app/pages/DegreeAudit.tsx` |
| FourYearPlan page | `site/src/app/pages/FourYearPlan.tsx` |
| CreditImport page | `site/src/app/pages/CreditImport.tsx` |
| ScheduleBuilder page | `site/src/app/pages/ScheduleBuilder.tsx` → `CoursePlannerPage` |

## 10. New Files to Create

| File | Purpose |
|---|---|
| `site/supabase/migrations/2026030900XXXX_degree_nodes_and_sections.sql` | Migration for §1 |
| `site/src/lib/types/requirements.ts` | TypeScript types for requirement trees |
| `site/src/lib/repositories/degreeRequirementsRepository.ts` | CRUD for sections + nodes |
| `site/src/lib/repositories/priorCreditsRepository.ts` | CRUD for user_prior_credits |
| `site/src/lib/services/auditDataService.ts` | Assemble user course records |
| `site/src/lib/services/requirementEvaluator.ts` | Recursive tree evaluation engine |
| `site/src/lib/services/requirementEvaluator.test.ts` | Evaluator unit tests |
| `site/src/features/degreeAudit/state/degreeAuditStore.ts` | Zustand store for audit page |
