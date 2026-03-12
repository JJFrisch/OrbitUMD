import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AutoGenerateSchedulePage } from "../AutoGenerateSchedulePage";

const { searchCoursesWithStrategy, getSectionsForCourse } = vi.hoisted(() => ({
  searchCoursesWithStrategy: vi.fn(),
  getSectionsForCourse: vi.fn(),
}));

vi.mock("../services/courseSearchService", () => ({
  searchCoursesWithStrategy,
  getSectionsForCourse,
}));

describe("AutoGenerateSchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    searchCoursesWithStrategy.mockImplementation(async ({ normalizedInput }: { normalizedInput: string }) => {
      const courses: Record<string, unknown> = {
        CMSC131: {
          id: "CMSC131-202608",
          courseCode: "CMSC131",
          name: "Object-Oriented Programming I",
          deptId: "CMSC",
          credits: 4,
          minCredits: 4,
          maxCredits: 4,
          genEds: [],
          term: "08",
          year: 2026,
        },
        MATH140: {
          id: "MATH140-202608",
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
        ENGL101: {
          id: "ENGL101-202608",
          courseCode: "ENGL101",
          name: "Academic Writing",
          deptId: "ENGL",
          credits: 4,
          minCredits: 4,
          maxCredits: 4,
          genEds: [],
          term: "08",
          year: 2026,
        },
      };

      return courses[normalizedInput] ? [courses[normalizedInput]] : [];
    });

    getSectionsForCourse.mockImplementation(async (courseCode: string) => {
      if (courseCode === "CMSC131") {
        return [
          {
            id: "CMSC131-0101",
            courseCode: "CMSC131",
            sectionCode: "0101",
            instructor: "Alice",
            instructors: ["Alice"],
            totalSeats: 30,
            openSeats: 6,
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
        ];
      }

      if (courseCode === "MATH140") {
        return [
          {
            id: "MATH140-0101",
            courseCode: "MATH140",
            sectionCode: "0101",
            instructor: "Carol",
            instructors: ["Carol"],
            totalSeats: 30,
            openSeats: 10,
            meetings: [{ days: "TuTh", startTime: "10:00am", endTime: "11:15am", location: "ESJ 2204" }],
          },
        ];
      }

      if (courseCode === "ENGL101") {
        return [
          {
            id: "ENGL101-0101",
            courseCode: "ENGL101",
            sectionCode: "0101",
            instructor: "Dana",
            instructors: ["Dana"],
            totalSeats: 20,
            openSeats: 8,
            meetings: [{ days: "MWF", startTime: "9:30am", endTime: "10:20am", location: "TWS 1100" }],
          },
          {
            id: "ENGL101-0201",
            courseCode: "ENGL101",
            sectionCode: "0201",
            instructor: "Evan",
            instructors: ["Evan"],
            totalSeats: 20,
            openSeats: 7,
            meetings: [{ days: "TuTh", startTime: "12:00pm", endTime: "12:50pm", location: "TWS 1101" }],
          },
        ];
      }

      return [];
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AutoGenerateSchedulePage />
      </MemoryRouter>
    );
  }

  it("generates conflict-free options with carousel navigation and summary", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131 MATH140" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByText(/Generated Schedules \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Option 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Classes: 2")).toBeInTheDocument();
    expect(screen.getByText("Earliest: 9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Latest: 11:15 AM")).toBeInTheDocument();
    expect(screen.getByText("CMSC131 - 0101 (6 open)")).toBeInTheDocument();
    expect(screen.queryByText("CMSC131 - 0201 (0 open)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Option 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Classes: 3")).toBeInTheDocument();
    expect(screen.getByText("Latest: 12:50 PM")).toBeInTheDocument();
    expect(screen.getByText("ENGL101 - 0201 (7 open)")).toBeInTheDocument();
    expect(screen.queryByText("ENGL101 - 0101 (8 open)")).not.toBeInTheDocument();
  });

  it("respects all-day day exclusions", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131" },
    });

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await waitFor(() => {
      expect(screen.getByText(/No valid sections remain for CMSC131 after applying criteria/)).toBeInTheDocument();
    });
  });
});
