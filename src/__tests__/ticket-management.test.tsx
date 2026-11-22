import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "../api/client";
import App from "../App";
import {
  attendeesResponse,
  createFetchMock,
  eventsResponse,
  jsonResponse,
  makeAttendee,
  makeEvent,
  NavButton,
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

beforeEach(() => {
  localStorage.clear();
  setAccessToken("test-token");
});

describe("TicketManagementPage", () => {
  it("loads attendees from the backend", async () => {
    const mock = createFetchMock(baseRoutes([
      {
        method: "GET",
        path: "/api/events/ev1/attendees",
        body: attendeesResponse([makeAttendee({ id: "a1", firstName: "Ada", lastName: "Lovelace" })]),
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Guest tickets")).toBeTruthy();
  });

  it("shows an empty state when there are no attendees", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([]) },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");

    expect(await screen.findByText("No attendees yet.")).toBeTruthy();
  });

  it("shows only newly issued ticket tokens", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1" })]) },
      {
        method: "POST",
        path: "/api/events/ev1/tickets/issue",
        body: { tickets: [{ attendeeId: "a1", ticketId: "t1", qrToken: "NEW-TOKEN" }], issuedCount: 1 },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /issue missing tickets/i }));

    expect(await screen.findByText("NEW-TOKEN")).toBeTruthy();
    expect(screen.getByText(/1 new ticket code/i)).toBeTruthy();
  });

  it("does not fabricate tokens when no new tickets are returned", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1", hasTicket: true })]) },
      { method: "POST", path: "/api/events/ev1/tickets/issue", body: { tickets: [], issuedCount: 0 } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /issue missing tickets/i }));

    await screen.findByText(/no new tickets needed/i);
    expect(screen.queryByText(/new ticket code/i)).toBeNull();
  });

  it("shows an error when issuance fails", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee()]) },
      { method: "POST", path: "/api/events/ev1/tickets/issue", status: 500, body: { message: "Issuance failed" } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /issue missing tickets/i }));

    expect(await screen.findByText("Issuance failed")).toBeTruthy();
  });

  it("clears previously issued tokens when switching events", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1" })]) },
      {
        method: "GET",
        path: "/api/events/ev2/attendees",
        body: attendeesResponse([makeAttendee({ id: "b1", firstName: "Grace", lastName: "Hopper" })]),
      },
      {
        method: "POST",
        path: "/api/events/ev1/tickets/issue",
        body: { tickets: [{ attendeeId: "a1", ticketId: "t1", qrToken: "TOKEN-EV1" }], issuedCount: 1 },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/tickets", "/dashboard/events/ev2/tickets", "go-ev2");
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /issue missing tickets/i }));
    expect(await screen.findByText("TOKEN-EV1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "go-ev2" }));

    expect(await screen.findByText("Grace Hopper")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("TOKEN-EV1")).toBeNull());
  });

  it("reissues and revokes an attendee ticket", async () => {
    let hasTicket = true;
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/events/ev1/attendees") {
        return jsonResponse(200, attendeesResponse([
          makeAttendee({ id: "a1", firstName: "Ada", lastName: "Lovelace", hasTicket }),
        ]));
      }
      if (method === "POST" && url.pathname === "/api/events/ev1/attendees/a1/tickets/reissue") {
        return jsonResponse(200, { attendeeId: "a1", ticketId: "t1", qrToken: "NEW-TOKEN" });
      }
      if (method === "POST" && url.pathname === "/api/events/ev1/attendees/a1/tickets/revoke") {
        hasTicket = false;
        return jsonResponse(200, { attendeeId: "a1", ticketId: "t1", ticketStatus: "VOID" });
      }
      return createFetchMock(baseRoutes())(input, init);
    });
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /reissue/i }));
    expect(await screen.findByText("NEW-TOKEN")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /reissue/i })).toBeNull());
  });

  it("loads attendee delivery state from the tickets list and resends the email", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/events/ev1/attendees") {
        return jsonResponse(200, attendeesResponse([
          makeAttendee({ id: "a1", firstName: "Ada", lastName: "Lovelace", hasTicket: true, ticketStatus: "ISSUED" }),
        ]));
      }
      if (method === "GET" && url.pathname === "/api/events/ev1/tickets") {
        return jsonResponse(200, {
          tickets: [{
            id: "t1",
            attendeeId: "a1",
            attendeeName: "Ada Lovelace",
            ticketStatus: "ISSUED",
            revoked: false,
            deliveryStatus: "FAILED",
            lastDeliveryAt: null,
            deliveryAttempts: 3,
            issuedAt: "2026-11-01T00:00:00.000Z",
            usedAt: null,
            checkedInAt: null,
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        });
      }
      if (method === "POST" && url.pathname === "/api/events/ev1/tickets/t1/resend-email") {
        return jsonResponse(200, { ticketId: "t1", attendeeId: "a1", deliveryStatus: "NOT_SENT", message: "Ticket email queued." });
      }
      return createFetchMock(baseRoutes())(input, init);
    });
    vi.stubGlobal("fetch", mock);

    renderApp("/dashboard/events/ev1/tickets");
    await screen.findByText("Ada Lovelace");
    expect(await screen.findByText("Email failed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));
    expect(await screen.findByText("Ticket email queued.")).toBeTruthy();
  });

  it("does not overwrite a newly selected event with a stale attendee response", async () => {
    let resolveEv2: (value: Response) => void = () => undefined;
    const ev2Promise = new Promise<Response>((resolve) => { resolveEv2 = resolve; });
    const base = createFetchMock(baseRoutes([
      { method: "GET", path: "/api/events/ev1/attendees", body: attendeesResponse([makeAttendee({ id: "a1", firstName: "Ada", lastName: "Lovelace" })]) },
      { method: "GET", path: "/api/events/ev2/attendees", body: attendeesResponse([makeAttendee({ id: "b1", firstName: "Grace", lastName: "Hopper" })]) },
    ]));
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/events/ev2/attendees") return ev2Promise;
      return base(input, init);
    });
    vi.stubGlobal("fetch", mock);

    render(
      <MemoryRouter initialEntries={["/dashboard/events/ev1/tickets"]}>
        <App />
        <NavButton to="/dashboard/events/ev2/tickets" label="to-ev2" />
        <NavButton to="/dashboard/events/ev1/tickets" label="to-ev1" />
      </MemoryRouter>,
    );

    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "to-ev2" }));
    fireEvent.click(screen.getByRole("button", { name: "to-ev1" }));

    resolveEv2({
      ok: true,
      status: 200,
      json: async () => attendeesResponse([makeAttendee({ id: "b1", firstName: "Grace", lastName: "Hopper" })]),
    } as unknown as Response);
    await Promise.resolve();

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeTruthy());
    expect(screen.queryByText("Grace Hopper")).toBeNull();
  });
});