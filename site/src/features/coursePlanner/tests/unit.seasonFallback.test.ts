import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSectionsForCourse } from "../services/courseSearchService";

function mockJsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("season fallback resolution", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fall back to a different season when loading course sections", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("courses/semesters")) {
        return mockJsonResponse(["202601", "202608"]);
      }

      if (url.includes("courses/sections")) {
        const parsed = new URL(url);
        const semester = parsed.searchParams.get("semester");
        if (semester === "202608") {
          return mockJsonResponse([
            {
              section_id: "CMSC351-0101",
              course: "CMSC351",
              number: "0101",
              instructor: "Fall Instructor",
              open_seats: 5,
              seats: 30,
              meetings: [
                {
                  days: ["M", "W", "F"],
                  start_time: "09:00",
                  end_time: "09:50",
                  building: "IRB",
                  room: "0324",
                },
              ],
            },
          ]);
        }

        if (semester === "202701") {
          return mockJsonResponse([]);
        }
      }

      return mockJsonResponse([]);
    });

    const sections = await getSectionsForCourse("CMSC351", "01", 2027);

    expect(sections).toHaveLength(0);
    const sectionRequests = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("courses/sections"));

    expect(sectionRequests.some((url) => url.includes("semester=202701"))).toBe(true);
    expect(sectionRequests.some((url) => url.includes("semester=202608"))).toBe(false);
  });

  it("uses a single source path for projected section lookups", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("courses/semesters")) {
        return mockJsonResponse(["202601", "202608"]);
      }

      if (url.includes("courses/sections") && url.includes("semester=202601")) {
        return mockJsonResponse([
          {
            section_id: "CMSC330-0101",
            course: "CMSC330",
            number: "0101",
            instructor: "Spring Instructor",
            open_seats: 9,
            seats: 30,
            meetings: [
              {
                days: ["M", "W", "F"],
                start_time: "10:00",
                end_time: "10:50",
                building: "IRB",
                room: "0324",
              },
            ],
          },
        ]);
      }

      if (url.includes("jupiterp.com")) {
        return mockJsonResponse([
          {
            sections: [
              {
                id: "CMSC330-JUP-0101",
                sectionCode: "0101",
                instructors: ["Wrong Source Instructor"],
                totalSeats: 999,
                openSeats: 999,
                meetings: [],
              },
            ],
          },
        ]);
      }

      return mockJsonResponse([]);
    });

    const sections = await getSectionsForCourse("CMSC330", "01", 2027);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.instructor).toBe("Spring Instructor");
    const requests = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requests.some((url) => url.includes("jupiterp.com"))).toBe(false);
  });
});
