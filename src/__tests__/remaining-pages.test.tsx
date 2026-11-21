import { screen } from "@testing-library/react";
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
  it("explains that password reset emails are unavailable", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/forgot-password");
    expect(await screen.findByText(/password reset emails aren't available/i)).toBeTruthy();
  });

  it("explains that password updates are unavailable", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/reset-password");
    expect(await screen.findByText(/password updates require a connected account service/i)).toBeTruthy();
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
  it("loads the event and shows an honest check-in stat", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock(authRoutes()));
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