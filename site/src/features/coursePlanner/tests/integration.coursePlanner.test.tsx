import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CoursePlannerPage } from "../CoursePlannerPage";
import { useCoursePlannerStore } from "../state/coursePlannerStore";

vi.mock("../services/courseSearchService", () => ({
  getDepartments: vi.fn(async () => [
    { code: "CMSC", name: "Computer Science" },
    { code: "MATH", name: "Mathematics" },
  ]),
  getActiveInstructors: vi.fn(async () => ["Alice", "Bob"]),
  getInstructorLookup: vi.fn(async () => ({
    byName: {
      alice: { name: "Alice", slug: "alice", averageRating: 4.5 },
      bob: { name: "Bob", slug: "bob", averageRating: 3.8 },
    },
  })),
  getInstructorMeta: vi.fn((lookup: { byName: Record<string, unknown> }, name: string) =>
    lookup.byName[name.toLowerCase()]
  ),
  searchCoursesWithStrategy: vi.fn(async () => [
    {
      id: "CMSC131-1",
      courseCode: "CMSC131",
      name: "Object-Oriented Programming I",
      deptId: "CMSC",
      credits: 4,
      minCredits: 4,
      maxCredits: 4,
      genEds: ["FSMA"],
      term: "08",
      year: 2026,
      description: "Intro course",
      conditions: {
        prereqs: "MATH140",
      },
      sections: [
        {
          id: "CMSC131-0101",
          courseCode: "CMSC131",
          sectionCode: "0101",
          instructor: "Alice",
          instructors: ["Alice"],
          totalSeats: 30,
          openSeats: 2,
          meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
        },
        {
          id: "CMSC131-0201",
          courseCode: "CMSC131",
          sectionCode: "0201",
          instructor: "Bob",
          instructors: ["Bob"],
          totalSeats: 30,
          openSeats: 0,
          meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
        },
      ],
    },
  ]),
  getSectionsForCourse: vi.fn(async () => [
    {
      id: "CMSC131-0101",
      courseCode: "CMSC131",
      sectionCode: "0101",
      instructor: "Alice",
      instructors: ["Alice"],
      totalSeats: 30,
      openSeats: 2,
      meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
    },
    {
      id: "CMSC131-0201",
      courseCode: "CMSC131",
      sectionCode: "0201",
      instructor: "Bob",
      instructors: ["Bob"],
      totalSeats: 30,
      openSeats: 0,
      meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
    },
  ]),
}));

describe("course planner integration", () => {
  beforeEach(() => {
    useCoursePlannerStore.setState({
      term: "08",
      year: 2026,
      resolvedTerm: "08",
      resolvedYear: 2026,
      readOnly: false,
      printMode: false,
      visibilityMode: "full",
      searchInput: "",
      normalizedInput: "",
      searchPending: false,
      searchError: undefined,
      searchResults: [],
      departments: [],
      instructors: [],
      instructorLookup: { byName: {} },
      suggestions: [],
      highlightedSuggestionIndex: -1,
      filters: {
        genEds: [],
        instructorInput: "",
        instructor: undefined,
        minCredits: null,
        maxCredits: null,
        onlyOpen: false,
        searchTerm: "",
      },
      selections: {},
      hoveredSelection: null,
      selectedInfoKey: null,
      latestRequestToken: 0,
    });
  });

  it("adds and removes section from schedule", async () => {
    render(<CoursePlannerPage />);

    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    expect(await screen.findByText("CMSC131")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("toggle sections"));
    fireEvent.click(await screen.findByLabelText("section 0101"));

    expect((await screen.findAllByTestId(/class-block-CMSC131::0101/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("section 0101"));
    expect(screen.queryAllByTestId(/class-block-CMSC131::0101/).length).toBe(0);
  });

  it("shows hover preview and hides on leave", async () => {
    render(<CoursePlannerPage />);
    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    fireEvent.click(await screen.findByLabelText("toggle sections"));

    const row = await screen.findByLabelText("section 0101");
    fireEvent.mouseEnter(row);
    expect((await screen.findAllByTestId("class-block-CMSC131::0101")).length).toBeGreaterThan(0);
    fireEvent.mouseLeave(row);
  });

  it("only-open filter hides closed section rows", async () => {
    render(<CoursePlannerPage />);
    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    fireEvent.click(await screen.findByLabelText("toggle sections"));

    fireEvent.click(screen.getByLabelText("Only open sections"));
    expect(screen.queryByLabelText("section 0201")).not.toBeInTheDocument();
  });

  it("term override and overlap render side-by-side", async () => {
    render(<CoursePlannerPage />);
    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    fireEvent.click(await screen.findByLabelText("toggle sections"));
    fireEvent.click(await screen.findByLabelText("section 0101"));

    useCoursePlannerStore.setState((state) => ({
      selections: {
        ...state.selections,
        "MATH140::0101": {
          sectionKey: "MATH140::0101",
          course: {
            id: "MATH140",
            courseCode: "MATH140",
            name: "Calculus I",
            deptId: "MATH",
            credits: 4,
            minCredits: 4,
            maxCredits: 4,
            genEds: [],
            term: "08",
            year: 2026,
          },
          section: {
            id: "MATH140-0101",
            courseCode: "MATH140",
            sectionCode: "0101",
            instructor: "Bob",
            instructors: ["Bob"],
            totalSeats: 30,
            openSeats: 10,
            meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am" }],
          },
        },
      },
    }));

    expect((await screen.findAllByTestId("class-block-CMSC131::0101")).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId("class-block-MATH140::0101")).length).toBeGreaterThan(0);
  });

  it("print mode hides search panel", async () => {
    render(<CoursePlannerPage />);
    fireEvent.click(screen.getByText("Export / Print"));
    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
  });

  it("renders external links and suppresses null text", async () => {
    render(<CoursePlannerPage />);

    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    fireEvent.click(await screen.findByLabelText("toggle sections"));

    const row = await screen.findByLabelText("section 0101");
    fireEvent.click(row);

    const instructorLink = await screen.findByRole("link", { name: "Alice" });
    fireEvent.click(instructorLink);
    expect(screen.queryAllByTestId(/class-block-CMSC131::0101/).length).toBeGreaterThan(0);

    const classBlock = (await screen.findAllByTestId("class-block-CMSC131::0101"))[0];
    fireEvent.click(classBlock);

    const testudoLink = await screen.findByRole("link", { name: "(view on Testudo)" });
    expect(testudoLink.getAttribute("href")).toContain("courseId=CMSC131");
    expect(document.body.textContent?.toLowerCase()).not.toContain("null");
    expect(document.body.textContent?.toLowerCase()).not.toContain("undefined");
  });

  it("renders PHYS487 detail lines and omits null rows", async () => {
    useCoursePlannerStore.setState((state) => ({
      ...state,
      selections: {
        "PHYS487::0102": {
          sectionKey: "PHYS487::0102",
          course: {
            id: "PHYS487-202608",
            courseCode: "PHYS487",
            name: "Computerized Instrumentation",
            deptId: "PHYS",
            credits: 3,
            minCredits: 3,
            maxCredits: 3,
            genEds: [],
            term: "08",
            year: 2026,
            description: "Full description text",
            conditions: {
              prereqs: "PHYS276 or Permission of Instructor.",
              restrictions: "Departmental Permission.",
              additionalInfo: "Cross-listed with PHYS687.",
              creditGrantedFor: "PHYS487 or PHYS687.",
              rawConditions: ["null", "undefined"],
            },
          },
          section: {
            id: "PHYS487-0102",
            courseCode: "PHYS487",
            sectionCode: "0102",
            instructor: "Alice",
            instructors: ["Alice", "Bob"],
            totalSeats: 10,
            openSeats: 0,
            waitlist: 0,
            holdfile: 0,
            meetings: [
              { days: "M", startTime: "2:00pm", endTime: "2:50pm", building: "PHY", room: "1402" },
              { days: "Tu", startTime: "2:00pm", endTime: "5:50pm", building: "PHY", room: "3214" },
            ],
          },
        },
      },
      selectedInfoKey: "PHYS487::0102",
      instructorLookup: {
        byName: {
          alice: { name: "Alice", slug: "alice", averageRating: 5 },
          bob: { name: "Bob", slug: "bob", averageRating: 4.2 },
        },
      },
    }));

    render(<CoursePlannerPage />);

    expect(await screen.findByText(/PHYS487 - Computerized Instrumentation/)).toBeInTheDocument();
    expect(screen.getByText("3 credits | Section 0102")).toBeInTheDocument();
    expect(screen.getByText(/M 2:00pm - 2:50pm in/)).toBeInTheDocument();
    expect(screen.getByText(/Tu 2:00pm - 5:50pm in/)).toBeInTheDocument();
    expect(screen.getByText("0 / 10 seats available")).toBeInTheDocument();
    expect(screen.getByText("Waitlist: 0")).toBeInTheDocument();
    expect(screen.getByText(/prereqs: PHYS276/)).toBeInTheDocument();
    expect(screen.getByText(/restrictions: Departmental Permission/)).toBeInTheDocument();
    expect(screen.getByText(/additional_info: Cross-listed with PHYS687/)).toBeInTheDocument();
    expect(screen.getByText(/credit_granted_for: PHYS487 or PHYS687/)).toBeInTheDocument();
    expect(screen.getByText("Full description text")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });
});
