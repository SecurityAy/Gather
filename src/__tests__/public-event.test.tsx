import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken } from "../api/client";
import { createFetchMock, makeEvent, renderApp } from "./test-utils";
import type { FetchRoute } from "./test-utils";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearAccessToken();
});

function publicRoutes(event: unknown): FetchRoute[] {
  return [
    { method: "GET", path: "/api/events/public/grad-2026", body: { event } },
  ];
}

const attendingConfirmation = {
  confirmation: {
    attendanceIntent: "ATTENDING" as const,
    status: "PENDING" as const,
    relationshipToGraduate: "Friend",
    createdAt: "2026-11-01T00:00:00.000Z",
    event: {
      title: "Graduation 2026",
      slug: "grad-2026",
      eventDate: "2026-12-01T16:00:00.000Z",
      timezone: "Africa/Lagos",
      venueName: "Main Hall",
      venueAddress: "1 Road",
      eventStatus: "PUBLISHED",
    },
    attendees: [{ firstName: "Ada", lastName: "Lovelace", attendeeType: "PRIMARY" as const }],
  },
};

describe("PublicEventPage", () => {
  it("shows the invitation and an RSVP call to action", async () => {
    vi.stubGlobal("fetch", createFetchMock(publicRoutes(makeEvent({ slug: "grad-2026", title: "Graduation 2026" }))));
    renderApp("/event/grad-2026");
    expect(await screen.findByText(/save me a seat/i)).toBeTruthy();
  });

  it("shows the closed state when the RSVP deadline has passed", async () => {
    vi.stubGlobal("fetch", createFetchMock(publicRoutes(makeEvent({ slug: "grad-2026", rsvpDeadline: "2026-01-01T22:59:59.000Z" }))));
    renderApp("/event/grad-2026");
    expect(await screen.findByText(/rsvps closed on/i)).toBeTruthy();
    expect(screen.queryByText(/save me a seat/i)).toBeNull();
  });

  it("shows the already-reserved state when the device has replied", async () => {
    const event = { ...makeEvent({ slug: "grad-2026" }), hasReserved: true };
    vi.stubGlobal("fetch", createFetchMock(publicRoutes(event)));
    renderApp("/event/grad-2026");
    expect(await screen.findByText(/you're already on the list/i)).toBeTruthy();
  });

  it("shows the unavailable page for a 404", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      { method: "GET", path: "/api/events/public/grad-2026", status: 404, body: { message: "Event not found." } },
    ]));
    renderApp("/event/grad-2026");
    expect(await screen.findByText(/this invitation/i)).toBeTruthy();
  });

  it("shows a recoverable error when the invitation cannot load", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      { method: "GET", path: "/api/events/public/grad-2026", status: 500, body: { message: "The invitation could not be loaded." } },
    ]));
    renderApp("/event/grad-2026");
    expect(await screen.findByText(/this invitation/i)).toBeTruthy();
    expect(await screen.findByText("The invitation could not be loaded.")).toBeTruthy();
  });
});

describe("RsvpConfirmation", () => {
  it("shows the attending confirmation", async () => {
    sessionStorage.setItem("gather.rsvp.grad-2026.token", "token-1");
    vi.stubGlobal("fetch", createFetchMock([
      { method: "POST", path: "/api/events/public/grad-2026/rsvp/confirmation", body: attendingConfirmation },
      { method: "GET", path: "/api/events/public/grad-2026", body: { event: makeEvent({ slug: "grad-2026", graduateName: "Ada Lovelace" }) } },
    ]));
    renderApp("/event/grad-2026/confirmation");
    expect(await screen.findByText(/your seat is/i)).toBeTruthy();
    expect(await screen.findByText(/almost yours/i)).toBeTruthy();
  });

  it("shows the not-attending confirmation", async () => {
    sessionStorage.setItem("gather.rsvp.grad-2026.token", "token-1");
    vi.stubGlobal("fetch", createFetchMock([
      {
        method: "POST",
        path: "/api/events/public/grad-2026/rsvp/confirmation",
        body: { confirmation: { ...attendingConfirmation.confirmation, attendanceIntent: "NOT_ATTENDING" } },
      },
      { method: "GET", path: "/api/events/public/grad-2026", body: { event: makeEvent({ slug: "grad-2026", graduateName: "Ada Lovelace" }) } },
    ]));
    renderApp("/event/grad-2026/confirmation");
    expect(await screen.findByText(/we'll miss you/i)).toBeTruthy();
    expect(await screen.findByText(/but we understand/i)).toBeTruthy();
  });

  it("shows an error when there is no confirmation token", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/event/grad-2026/confirmation");
    expect(await screen.findByText(/no rsvp confirmation token was found/i)).toBeTruthy();
  });
});