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
  searchCoursesWithStrategy: vi.fn(async () => [
    {
      id: "CMSC131-1",
      courseCode: "CMSC131",
      name: "Object-Oriented Programming I",
      deptId: "CMSC",
      credits: 4,
      genEds: ["FSMA"],
      term: "08",
      year: 2026,
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

    expect(await screen.findByTestId(/class-block-CMSC131::0101/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("section 0101"));
    expect(screen.queryByTestId(/class-block-CMSC131::0101/)).not.toBeInTheDocument();
  });

  it("shows hover preview and hides on leave", async () => {
    render(<CoursePlannerPage />);
    fireEvent.change(screen.getByPlaceholderText("Search courses"), { target: { value: "cmsc131" } });
    fireEvent.click(await screen.findByLabelText("toggle sections"));

    const row = await screen.findByLabelText("section 0101");
    fireEvent.mouseEnter(row);
    expect(await screen.findByTestId("class-block-CMSC131::0101")).toBeInTheDocument();
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

    expect(await screen.findByTestId("class-block-CMSC131::0101")).toBeInTheDocument();
    expect(await screen.findByTestId("class-block-MATH140::0101")).toBeInTheDocument();
  });

  it("print mode hides search panel", async () => {
    render(<CoursePlannerPage />);
    fireEvent.click(screen.getByText("Export / Print"));
    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
  });
});
