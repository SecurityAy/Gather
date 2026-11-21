import { render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { vi } from "vitest";
import App from "../App";
import type { ApiAttendee, ApiEvent, ApiUser } from "../api/client";

export function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

export function NavButton({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      {label}
    </button>
  );
}

export function renderAppWithNav(path: string, navTo: string, navLabel = "navigate") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <NavButton to={navTo} label={navLabel} />
    </MemoryRouter>,
  );
}

export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

export interface FetchRoute {
  method: string;
  path: string | RegExp;
  status?: number;
  body: unknown;
}

export function createFetchMock(routes: FetchRoute[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find((candidate) =>
      candidate.method === method &&
      (typeof candidate.path === "string" ? url.pathname === candidate.path : candidate.path.test(url.pathname)),
    );
    if (!route) {
      return jsonResponse(404, { message: `Unhandled ${method} ${url.pathname}` });
    }
    return jsonResponse(route.status ?? 200, route.body);
  });
}

export const testUser: ApiUser = {
  id: "user1",
  firstName: "Ada",
  lastName: "Organiser",
  email: "ada@example.com",
  accountStatus: "ACTIVE",
  emailVerifiedAt: null,
  profileImageUrl: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

export function makeEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "ev1",
    userId: "user1",
    title: "Graduation 2026",
    slug: "graduation-2026",
    eventCategory: "GRADUATION",
    description: null,
    graduateName: "Ada",
    graduateImageUrl: null,
    institution: null,
    faculty: null,
    department: null,
    qualification: null,
    eventDate: "2026-12-01T16:00:00.000Z",
    timezone: "Africa/Lagos",
    venueName: "Main Hall",
    venueAddress: "1 Road",
    venueInstructions: null,
    personalMessage: null,
    coverImageUrl: null,
    rsvpDeadline: "2026-11-25T22:59:59.000Z",
    additionalGuestLimit: 1,
    maxGuestCapacity: 100,
    reservedGuestCount: 0,
    availableGuestCount: 100,
    approvalRequired: false,
    eventStatus: "PUBLISHED",
    publishedAt: null,
    deletedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeAttendee(overrides: Partial<ApiAttendee> = {}): ApiAttendee {
  return {
    id: "att1",
    firstName: "Ada",
    lastName: "Lovelace",
    attendeeType: "PRIMARY",
    attendanceIntent: "ATTENDING",
    registrationStatus: "APPROVED",
    hasTicket: false,
    checkedIn: false,
    checkedInAt: null,
    ...overrides,
  };
}

export function eventsResponse(events: ApiEvent[]) {
  return {
    events,
    pagination: { page: 1, pageSize: 100, total: events.length, totalPages: 1 },
  };
}

export function attendeesResponse(attendees: ApiAttendee[]) {
  return {
    attendees,
    pagination: { page: 1, pageSize: 20, total: attendees.length, totalPages: 1 },
  };
}

export function authRoutes(user: ApiUser = testUser): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user } },
  ];
}