import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "../api/client";
import { createFetchMock, eventsResponse, makeEvent, renderApp, testUser } from "./test-utils";
import type { FetchRoute } from "./test-utils";

beforeEach(() => {
  localStorage.clear();
  setAccessToken("test-token");
});

function dashboardRoutes(): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    {
      method: "GET",
      path: "/api/events",
      body: eventsResponse([
        makeEvent({
          id: "ev1",
          title: "Graduation 2026",
          counts: { registrationCount: 12, pendingRegistrationCount: 4, approvedAttendeeCount: 8 },
        }),
      ]),
    },
  ];
}

function statCard(label: string): HTMLElement | null {
  return screen.getByText(label).closest(".stat-card");
}

describe("DashboardPage", () => {
  it("shows real totals from the API", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));

    renderApp("/dashboard");
    await screen.findAllByText("Graduation 2026");

    expect(statCard("RSVPs received")?.querySelector("strong")?.textContent).toBe("12");
    expect(statCard("Guests approved")?.querySelector("strong")?.textContent).toBe("08");
    expect(statCard("Your events")?.querySelector("strong")?.textContent).toBe("01");
  });

  it("shows an honest unavailable state instead of a fabricated check-in count", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));

    renderApp("/dashboard");
    await screen.findAllByText("Graduation 2026");

    const checkedCard = statCard("Checked in");
    expect(checkedCard?.querySelector("strong")?.textContent).toBe("—");
    expect(checkedCard?.textContent).not.toMatch(/\b00\b/);
    expect(checkedCard?.textContent).toMatch(/open an event's check-in page/i);
  });
});