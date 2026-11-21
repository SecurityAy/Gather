import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "../api/client";
import {
  createFetchMock,
  eventsResponse,
  makeEvent,
  renderAppWithNav,
  testUser,
} from "./test-utils";
import type { FetchRoute } from "./test-utils";

const primaryAttendee = {
  id: "a1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "080",
  attendeeType: "PRIMARY",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const secondAttendee = {
  id: "a2",
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@example.com",
  phone: "081",
  attendeeType: "PRIMARY",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const pendingRegistration = {
  id: "reg1",
  attendanceIntent: "ATTENDING",
  status: "PENDING",
  relationshipToGraduate: "Friend",
  createdAt: "2026-11-01T00:00:00.000Z",
  attendees: [primaryAttendee],
};

function baseRoutes(extra: FetchRoute[] = []): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    {
      method: "GET",
      path: "/api/events",
      body: eventsResponse([makeEvent({ id: "ev1" }), makeEvent({ id: "ev2" })]),
    },
    { method: "GET", path: "/api/events/ev1/rsvps/g1", body: { registration: pendingRegistration } },
    {
      method: "GET",
      path: "/api/events/ev1/rsvps/g2",
      body: {
        registration: { ...pendingRegistration, id: "reg2", attendees: [secondAttendee] },
      },
    },
    ...extra,
  ];
}

beforeEach(() => {
  localStorage.clear();
  setAccessToken("test-token");
});

describe("GuestDetailsPage", () => {
  it("approves a registration and reveals newly issued ticket codes", async () => {
    const mock = createFetchMock(baseRoutes([
      {
        method: "POST",
        path: "/api/events/ev1/rsvps/reg1/approve",
        body: {
          registration: { ...pendingRegistration, status: "APPROVED" },
          tickets: [{ attendeeId: "a1", ticketId: "t1", qrToken: "APPROVED-TOKEN" }],
        },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/guests/g1", "/dashboard/events/ev1/guests/g2", "go-g2");
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: /approve registration/i }));

    expect(await screen.findByText(/registration approved/i)).toBeTruthy();
    expect(await screen.findByText("APPROVED-TOKEN")).toBeTruthy();
  });

  it("rejects a registration", async () => {
    const mock = createFetchMock(baseRoutes([
      {
        method: "POST",
        path: "/api/events/ev1/rsvps/reg1/reject",
        body: { registration: { ...pendingRegistration, status: "DECLINED" } },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/guests/g1", "/dashboard/events/ev1/guests/g2", "go-g2");
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: /reject registration/i }));

    expect(await screen.findByText("Registration rejected.")).toBeTruthy();
  });

  it("shows an error when the decision fails", async () => {
    const mock = createFetchMock(baseRoutes([
      { method: "POST", path: "/api/events/ev1/rsvps/reg1/approve", status: 500, body: { message: "Could not approve" } },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/guests/g1", "/dashboard/events/ev1/guests/g2", "go-g2");
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: /approve registration/i }));

    expect(await screen.findByText("Could not approve")).toBeTruthy();
  });

  it("clears ticket codes and decisions when switching guests", async () => {
    const mock = createFetchMock(baseRoutes([
      {
        method: "POST",
        path: "/api/events/ev1/rsvps/reg1/approve",
        body: {
          registration: { ...pendingRegistration, status: "APPROVED" },
          tickets: [{ attendeeId: "a1", ticketId: "t1", qrToken: "APPROVED-TOKEN" }],
        },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    renderAppWithNav("/dashboard/events/ev1/guests/g1", "/dashboard/events/ev1/guests/g2", "go-g2");
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: /approve registration/i }));
    expect(await screen.findByText("APPROVED-TOKEN")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "go-g2" }));

    expect(await screen.findByRole("heading", { name: "Grace Hopper" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("APPROVED-TOKEN")).toBeNull());
    expect(screen.queryByText(/registration approved/i)).toBeNull();
  });
});