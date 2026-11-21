import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../Scanner", () => ({
  default: () => <div data-testid="scanner-mock" />,
}));

import { setAccessToken } from "../api/client";
import {
  attendeesResponse,
  createFetchMock,
  eventsResponse,
  makeAttendee,
  makeEvent,
  renderApp,
  renderAppWithNav,
  testUser,
} from "./test-utils";
import type { FetchRoute } from "./test-utils";

function baseRoutes(extra: FetchRoute[] = []): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    {
      method: "GET",
      path: "/api/events",
      body: eventsResponse([
        makeEvent({ id: "ev1", title: "Graduation 2026" }),
        makeEvent({ id: "ev2", title: "Graduation 2027" }),
      ]),
    },
    ...extra,
  ];
}

const checkInSuccess = {
  message: "Guest checked in successfully",
  attendee: { id: "a1", firstName: "Ada", lastName: "Lovelace", attendeeType: "PRIMARY" },
  checkedInAt: "2026-11-21T12:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
  setAccessToken("test-token");
});

describe("CheckInPage", () => {
  it("checks a guest in and shows the attendee and time", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1" })]) },
      { method: "POST", path: "/api/tickets/checkin", body: checkInSuccess },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/check-in");
    await screen.findByPlaceholderText(/paste ticket code/i);
    // The page mounts behind an async auth gate; wait for the attendee list to
    // load so CheckInPage's mount effects (which reset the scan input) have
    // flushed before we type.
    await screen.findByText("Ada Lovelace");

    fireEvent.change(screen.getByPlaceholderText(/paste ticket code/i), { target: { value: "TOKEN-1" } });
    fireEvent.click(screen.getByRole("button", { name: /check ticket/i }));

    expect(await screen.findByText("You're all set!")).toBeTruthy();
    expect(await screen.findByText(/Ada Lovelace · checked in at/)).toBeTruthy();

    const checkInCall = mock.mock.calls.find((call) => {
      const init = (call[1] ?? {}) as RequestInit;
      return (init.method ?? "GET").toUpperCase() === "POST";
    });
    const body = JSON.parse(String((checkInCall?.[1] as RequestInit).body));
    expect(body).toEqual({ eventId: "ev1", qrToken: "TOKEN-1" });
  });

  it("explains an unrecognised ticket", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee()]) },
      { method: "POST", path: "/api/tickets/checkin", status: 404, body: { message: "Ticket not found for this event." } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/check-in");
    await screen.findByPlaceholderText(/paste ticket code/i);

    fireEvent.change(screen.getByPlaceholderText(/paste ticket code/i), { target: { value: "BAD" } });
    fireEvent.click(screen.getByRole("button", { name: /check ticket/i }));

    expect(await screen.findByText("Ticket not recognised")).toBeTruthy();
  });

  it("explains a duplicate check-in", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee()]) },
      { method: "POST", path: "/api/tickets/checkin", status: 409, body: { message: "This ticket is not eligible for check-in." } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/check-in");
    await screen.findByPlaceholderText(/paste ticket code/i);

    fireEvent.change(screen.getByPlaceholderText(/paste ticket code/i), { target: { value: "USED" } });
    fireEvent.click(screen.getByRole("button", { name: /check ticket/i }));

    expect(await screen.findByText("Already checked in or not eligible")).toBeTruthy();
  });

  it("blocks a second concurrent submission", async () => {
    const pending = new Promise<Response>(() => undefined);
    const base = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee()]) },
    ]));
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") return pending;
      return base(input, init);
    });
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/check-in");
    await screen.findByPlaceholderText(/paste ticket code/i);

    fireEvent.change(screen.getByPlaceholderText(/paste ticket code/i), { target: { value: "TOKEN-1" } });
    const button = screen.getByRole("button", { name: /check ticket/i });
    fireEvent.click(button);
    fireEvent.click(button);

    const checkInCalls = mock.mock.calls.filter((call) => {
      const init = (call[1] ?? {}) as RequestInit;
      return (init.method ?? "GET").toUpperCase() === "POST";
    });
    expect(checkInCalls).toHaveLength(1);
  });

  it("clears the scan result when switching events", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1" })]) },
      { method: "GET", path: "/api/events/ev2/attendees", body: attendeesResponse([makeAttendee({ id: "b1", firstName: "Grace", lastName: "Hopper" })]) },
      { method: "POST", path: "/api/tickets/checkin", body: checkInSuccess },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/check-in", "/dashboard/events/ev2/check-in", "go-ev2");
    await screen.findByPlaceholderText(/paste ticket code/i);

    fireEvent.change(screen.getByPlaceholderText(/paste ticket code/i), { target: { value: "TOKEN-1" } });
    fireEvent.click(screen.getByRole("button", { name: /check ticket/i }));
    expect(await screen.findByText("You're all set!")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "go-ev2" }));

    await waitFor(() => expect(screen.queryByText("You're all set!")).toBeNull());
    expect(await screen.findByText("Grace Hopper")).toBeTruthy();
  });

  it("shows an error when attendees cannot be loaded", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", status: 500, body: { message: "Could not load attendees." } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/check-in");

    expect(await screen.findByText("Could not load attendees.")).toBeTruthy();
  });
});