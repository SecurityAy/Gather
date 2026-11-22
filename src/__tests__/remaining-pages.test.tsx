import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../api/client";
import { createFetchMock, eventsResponse, makeEvent, renderApp, testUser } from "./test-utils";
import type { FetchRoute } from "./test-utils";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearAccessToken();
});

const ev1 = makeEvent({ id: "ev1", title: "Graduation 2026", graduateName: "Ada Lovelace" });

function authRoutes(): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    { method: "GET", path: "/api/events", body: eventsResponse([ev1]) },
    { method: "GET", path: "/api/events/ev1", body: { event: ev1 } },
  ];
}

describe("HomePage", () => {
  it("renders the marketing hero and calls to action", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/");
    expect(await screen.findByText(/create your invitation/i)).toBeTruthy();
  });
});

describe("Password recovery pages", () => {
  it("asks for an email address to send the reset link", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/forgot-password");
    expect(await screen.findByText(/forgot your password/i)).toBeTruthy();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
  });

  it("asks for a new password on the reset page", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/reset-password");
    expect(await screen.findByText(/choose a new password/i)).toBeTruthy();
    expect(screen.getByLabelText(/^new password/i)).toBeTruthy();
  });
});

describe("PublicTicketPage", () => {
  it("explains that live ticket validation is not connected for guests", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/ticket/unknown-token");
    expect(await screen.findByText(/this prototype can only display sample tickets/i)).toBeTruthy();
  });

  it("explains that live ticket validation is not connected for signed-in hosts", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock(authRoutes()));
    renderApp("/ticket/unknown-token");
    expect(await screen.findByText(/live ticket validation is not connected yet/i)).toBeTruthy();
  });
});

describe("EventOverviewPage", () => {
  const ev1WithCheckIns = {
    ...ev1,
    counts: { registrationCount: 5, pendingRegistrationCount: 1, approvedAttendeeCount: 4, checkedInCount: 3 },
  };

  function overviewRoutes(event: typeof ev1 = ev1, extra: FetchRoute[] = []): FetchRoute[] {
    return [
      { method: "GET", path: "/api/auth/me", body: { user: testUser } },
      { method: "GET", path: "/api/events", body: eventsResponse([event]) },
      { method: "GET", path: "/api/events/ev1", body: { event } },
      ...extra,
    ];
  }

  it("shows a real check-in count when the API provides one", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock(overviewRoutes(ev1WithCheckIns)));
    renderApp("/dashboard/events/ev1");

    expect(await screen.findByRole("heading", { name: /graduation 2026/i })).toBeTruthy();
    const checked = screen.getByText("Checked in");
    expect(checked.parentElement?.querySelector("b")?.textContent).toBe("03");
  });

  it("picks up a check-in count added by a detail refresh", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock([
      { method: "GET", path: "/api/auth/me", body: { user: testUser } },
      { method: "GET", path: "/api/events", body: eventsResponse([ev1]) },
      { method: "GET", path: "/api/events/ev1", body: { event: ev1WithCheckIns } },
    ]));
    renderApp("/dashboard/events/ev1");

    expect(await screen.findByRole("heading", { name: /graduation 2026/i })).toBeTruthy();
    await waitFor(() => {
      const checked = screen.getByText("Checked in");
      expect(checked.parentElement?.querySelector("b")?.textContent).toBe("03");
    });
  });

  it("shows an honest placeholder when the API has no check-in count", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock(overviewRoutes(ev1)));
    renderApp("/dashboard/events/ev1");

    expect(await screen.findByRole("heading", { name: /graduation 2026/i })).toBeTruthy();
    const checked = screen.getByText("Checked in");
    expect(checked.parentElement?.querySelector("b")?.textContent).toBe("—");
  });
});

describe("GuestManagementPage", () => {
  it("loads registrations and shows the guest", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock([
      ...authRoutes(),
      {
        method: "GET",
        path: "/api/events/ev1/rsvps",
        body: {
          registrations: [
            {
              id: "reg1",
              attendanceIntent: "ATTENDING",
              status: "PENDING",
              relationshipToGraduate: "Friend",
              createdAt: "2026-11-01T00:00:00.000Z",
              attendees: [{ id: "att1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: null, attendeeType: "PRIMARY", createdAt: "2026-11-01T00:00:00.000Z" }],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      },
    ]));
    renderApp("/dashboard/events/ev1/guests");

    expect(await screen.findByText(/ada lovelace/i)).toBeTruthy();
  });
});