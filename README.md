<div align="center">

<!-- TODO: Replace with actual screenshot or logo -->
<!-- ![OrbitUMD Banner](docs/images/banner.png) -->

# OrbitUMD

**Unified academic planning for University of Maryland students.**

Schedule building &nbsp;·&nbsp; Degree audit &nbsp;·&nbsp; Four-year planning &nbsp;·&nbsp; Gen Ed tracking

[![Live Demo](https://img.shields.io/badge/Live_Demo-jjfrisch.github.io%2FOrbitUMD-E53935?style=for-the-badge)](https://jjfrisch.github.io/OrbitUMD/)

</div>

---

OrbitUMD unifies schedule building, long-term degree planning, course timings, and requirement tracking into a single tool. It aims to make academic planning more accessible and engaging, and to help students feel excited about choosing their educational journey.

Unlike the current fragmented ecosystem:

- **Jupiterp** — single schedule term visualization
- **Venus** — schedule generation
- **UAchieve / Testudo** — unofficial degree audit

OrbitUMD is designed for **multi-year**, exploratory planning across majors and minors, with dynamic requirement tracking and rich data pipelines to connect everything and make students' lives easier.

> On the landing page, click **Demo** to explore a preloaded account, or create your own account to experience the full workflow.

<!-- ┌──────────────────────────────────────────────────────────┐ -->
<!-- │  IMAGE SUGGESTION: Full-width hero screenshot of the    │ -->
<!-- │  dashboard or schedule builder. Place at:               │ -->
<!-- │  docs/images/hero-screenshot.png                        │ -->
<!-- │                                                         │ -->
<!-- │  ![OrbitUMD Dashboard](docs/images/hero-screenshot.png) │ -->
<!-- └──────────────────────────────────────────────────────────┘ -->

---

## Motivation

Many UMD students approach course selection reactively, relying on advisors and scattered tools without a clear sense of long-term direction. Existing platforms are powerful but siloed:

- **Jupiterp** — visualizes a single semester's schedule.
- **Venus** — generates possible schedules given constraints.
- **Degree audit tools (UAchieve/Testudo)** — provide requirement status, but are not tightly integrated into planning workflows.

OrbitUMD aims to:

- Centralize academic planning across multiple years.
- Make degree paths and tradeoffs transparent.
- Support students who are undecided between majors/minors, or looking to switch.
- Encourage proactive, engaged planning rather than one-off schedule building.

---

## Features

<!-- ┌──────────────────────────────────────────────────────────┐ -->
<!-- │  IMAGE / GIF SUGGESTION: For each feature, add a small  │ -->
<!-- │  screenshot or short GIF showing it in action.          │ -->
<!-- │  Place them at docs/images/feature-*.png                │ -->
<!-- └──────────────────────────────────────────────────────────┘ -->

| Feature | Description |
| :--- | :--- |
| **Interactive Schedule Builder** | Conflict-aware class planning with calendar visualization, similar to Jupiterp but embedded in a broader planning context. |
| **Auto-Generate Schedules** | Compute conflict-free schedules based on user constraints, similar to Venus. |
| **Four-Year Planning** | Build semester-by-semester roadmaps for multiple years, not just a single term. |
| **Degree Audit & Gen Ed Tracking** | Show satisfied, in-progress, and unmet requirements, approximating degree audit behavior. |
| **Requirement Corpus & Validation** | A structured major/minor requirement corpus with validation pipelines for quality and consistency. |
| **UMD Catalog Sync Pipeline** | Ingest courses, sections, meetings, and term metadata into Postgres/Supabase from the official catalog. |
| **User Persistence** | Store user-specific schedules, four-year plans, and profile-linked academic data. |

<!-- ┌──────────────────────────────────────────────────────────┐ -->
<!-- │  VIDEO SUGGESTION: A 30–60 second screen recording      │ -->
<!-- │  walking through the core workflow (build schedule →     │ -->
<!-- │  check degree audit → plan four years). Host on YouTube │ -->
<!-- │  or as a GIF and embed here:                            │ -->
<!-- │                                                         │ -->
<!-- │  https://github.com/user-attachments/assets/...         │ -->
<!-- └──────────────────────────────────────────────────────────┘ -->

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, React Router, Zustand |
| **UI** | Tailwind CSS, Radix UI, MUI, Lucide, Recharts, React DnD |
| **Backend & Data** | Supabase (Postgres + Auth + Row Level Security), migration-first schema management |
| **Data Engineering** | Node.js scripts for catalog sync/ingestion, Python + notebooks for catalog scraping, `pg`, `dotenv`, Cheerio |
| **Testing & Tooling** | Vitest + Testing Library, TypeScript type-checking as lint gate, regression corpus tooling |

---

## AI Use and Development Process

I use AI tools selectively for:

- Basic code scaffolding
- SQL table setup
- Some API integrations (e.g., umd.io, jupiterp.io)

However, the **vast majority** of OrbitUMD is independently designed and implemented. Over roughly 2.5-3.5 months, I have:

- Worked on the project nearly every day
- Made hundreds of commits
- Iterated continuously on UX, data models, and infrastructure

This is a long-term project I'm deeply invested in, not a quick prototype.

---

## Potential Directions

OrbitUMD could evolve along several paths:

| Path | Description |
| :--- | :--- |
| **1. Standalone tool** | A public tool used unofficially by UMD students, similar to Jupiterp. |
| **2. Semi-integrated** | Integrated with UMD systems where possible (e.g., uAchieve degree audit APIs), while still managed externally. |
| **3. Fully institutional** | Deployed within UMD infrastructure (e.g., alongside Testudo) for direct use by students and advisors. |

Options 2 and 3 would require collaboration with UMD faculty, advisors, administrators, and IT systems — especially around data access and ownership, security and privacy, and long-term maintenance.

---

## Goals and Collaboration

My primary goals for OrbitUMD are to:

- Improve the transparency and usability of academic planning at UMD.
- Make degree pathways more interactive and engaging.
- Support students who are undecided or exploring multiple programs.

**I'm actively seeking:**

- Feedback on the platform's direction, UX, and technical architecture.
- Guidance on safely and responsibly integrating with UMD systems (e.g., uAchieve, advising tools).
- Potential collaborators, research advisors, or institutional partners interested in academic planning tools.

---

## About the Author

**Jake Frischmann**
University of Maryland, College Park
B.S. Computer Science & B.S. Physics (Quantum Science and Engineering minor)
Class of 2029

I'm a freshman dual-degree student interested in systems that improve student experience, with particular focus on tooling, planning, and transparency in academic paths.

<!-- ┌──────────────────────────────────────────────────────────┐ -->
<!-- │  IMAGE SUGGESTION: Add a small headshot or avatar here  │ -->
<!-- │  if you'd like a personal touch.                        │ -->
<!-- └──────────────────────────────────────────────────────────┘ -->
