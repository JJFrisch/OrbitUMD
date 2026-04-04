# OrbitUMD

OrbitUMD is an academic planning platform for University of Maryland students that unifies schedule building, long‑term degree planning, and requirement tracking into a single, integrated tool.

Unlike the current fragmented ecosystem:

- Jupiterp (single-term visualization)
- Venus (schedule generation)
- Testudo’s unofficial degree audit (UAchieve)

OrbitUMD is designed for **multi-year**, exploratory planning across majors and minors, with dynamic requirement tracking and rich data pipelines behind the scenes.

You can try the current version here:  
[https://jjfrisch.github.io/OrbitUMD/](https://jjfrisch.github.io/OrbitUMD/)

On the landing page, click “Demo” to explore a preloaded account, or create your own account to experience the full workflow.

---

## Motivation

Many UMD students approach course selection reactively, relying on advisors and scattered tools without a clear sense of long‑term direction. Existing platforms are powerful but siloed:

- Jupiterp: visualizes a single semester’s schedule.
- Venus: generates possible schedules given constraints.
- Degree audit tools (UAchieve/Testudo): provide requirement status, but are not tightly integrated into planning workflows.

OrbitUMD aims to:

- Centralize academic planning across multiple years.
- Make degree paths and tradeoffs transparent.
- Support students who are undecided between majors/minors.
- Encourage proactive, engaged planning rather than one‑off schedule building.

---

## Features

OrbitUMD currently supports:

- **Interactive schedule builder**  
  Conflict-aware class planning with calendar visualization, similar to Jupiterp but embedded in a broader planning context.

- **Auto‑generate schedules**  
  Compute conflict‑free schedules based on user constraints, similar to Venus.

- **Four‑year planning**  
  Build semester‑by‑semester roadmaps for multiple years, not just a single term.

- **Degree audit & Gen Ed tracking**  
  Show satisfied, in‑progress, and unmet requirements, approximating degree audit behavior.

- **Requirement corpus & validation**  
  A structured major/minor requirement corpus with validation pipelines for quality and consistency.

- **UMD catalog sync pipeline**  
  Ingest courses, sections, meetings, and term metadata into Postgres/Supabase from the official catalog.

- **User persistence**  
  Store user-specific schedules, four‑year plans, and profile‑linked academic data.

---

## Tech Stack

**Frontend**

- React 18 + TypeScript + Vite  
- React Router for navigation  
- Zustand for client state management  

**UI**

- Tailwind CSS  
- Radix UI primitives  
- Additional component libraries: MUI, Lucide, Recharts, React DnD  

**Backend & Data**

- Supabase (Postgres + Auth + Row Level Security)  
- Migration‑first schema management  

**Data Engineering & Imports**

- Node.js (JavaScript/TypeScript) scripts for catalog sync and ingestion  
- Python + notebook‑based tooling for the catalog scraper  
- `pg` client, `dotenv`, Cheerio, and related parsing/scraping utilities  

**Testing & Tooling**

- Vitest + Testing Library for frontend tests  
- TypeScript type‑checking as a lint gate  
- Regression corpus tooling for data and behavior quality control  

---

## AI Use and Development Process

I use AI tools selectively for:

- Basic code scaffolding  
- SQL table setup  
- Some API integrations (e.g., umd.io, jupiterp.io)  

However, the **vast majority** of OrbitUMD is independently designed and implemented. Over roughly 2.5–3.5 months, I have:

- Worked on the project nearly every day  
- Made hundreds of commits  
- Iterated continuously on UX, data models, and infrastructure  

This is a long‑term project I’m deeply invested in, not a quick prototype.

---

## Potential Directions

OrbitUMD could evolve along several paths:

1. **Standalone, non‑UMD‑affiliated tool**  
   Similar to Jupiterp: a public tool used unofficially by UMD students.

2. **Semi‑integrated UMD tool**  
   Integrated with UMD systems where possible (e.g., using uAchieve degree audit APIs for higher‑fidelity data), while still managed externally.

3. **Fully integrated institutional solution**  
   Deployed within UMD infrastructure (e.g., alongside or within Testudo) for direct use by students and advisors.

Options (2) and (3) would require collaboration with UMD faculty, advisors, administrators, and IT systems, especially around:

- Data access and ownership  
- Security and privacy  
- Long‑term maintenance and institutional support  

---

## Goals and Collaboration

My primary goals for OrbitUMD are to:

- Improve the transparency and usability of academic planning at UMD.  
- Make degree pathways more interactive and engaging.  
- Support students who are undecided or exploring multiple programs.  

I’m actively seeking:

- Feedback on the platform’s direction, UX, and technical architecture.  
- Guidance on safely and responsibly integrating with UMD systems (e.g., uAchieve, advising tools).  
- Potential collaborators, research advisors, or institutional partners interested in academic planning tools.

---

## About the Author

**Jake Frischmann**  
University of Maryland, College Park  
B.S. Computer Science & B.S. Physics (Quantum Science and Engineering minor)  
Class of 2029  
UID: 122214590

I’m a freshman dual‑degree student interested in systems that improve student experience, with particular focus on tooling, planning, and transparency in academic paths.