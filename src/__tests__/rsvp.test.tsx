import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchMock, renderApp } from "./test-utils";
import type { FetchRoute } from "./test-utils";

const slug = "graduation-2026";

function makePublicEvent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Graduation 2026",
    slug,
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
    hasReserved: false,
    ...overrides,
  };
}

function rsvpRoutes(extra: FetchRoute[] = [], event = makePublicEvent()): FetchRoute[] {
  return [
    { method: "GET", path: `/api/events/public/${slug}`, body: { event } },
    ...extra,
  ];
}

const confirmation = {
  attendanceIntent: "ATTENDING",
  status: "PENDING",
  relationshipToGraduate: "Friend",
  createdAt: "2026-11-21T00:00:00.000Z",
  event: {
    title: "Graduation 2026",
    slug,
    eventDate: "2026-12-01T16:00:00.000Z",
    timezone: "Africa/Lagos",
    venueName: "Main Hall",
    venueAddress: "1 Road",
    eventStatus: "PUBLISHED",
  },
  attendees: [{ firstName: "Ada", lastName: "Lovelace", attendeeType: "PRIMARY" }],
};

function fillValidForm(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText(/your full name/i), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+234 800 000 0000" } });
  fireEvent.change(screen.getByLabelText(/how do you know/i), { target: { value: "Friend" } });
  fireEvent.click(screen.getByRole("button", { name: /i would love to attend/i }));
  return container.querySelector("form") as HTMLFormElement;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("RsvpPage", () => {
  it("requires the guest to choose whether they will attend", async () => {
    const mock = createFetchMock(rsvpRoutes());
    vi.stubGlobal("fetch", mock);

    const { container } = renderApp(`/event/${slug}/rsvp`);
    await screen.findByLabelText(/your full name/i);

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Let us know if you'll be there.")).toBeTruthy();
  });

  it("submits a valid RSVP and shows the confirmation", async () => {
    const mock = createFetchMock(rsvpRoutes([
      {
        method: "POST",
        path: `/api/events/public/${slug}/rsvp`,
        body: { confirmationToken: "CONFIRM-1", registration: {} },
      },
      {
        method: "POST",
        path: `/api/events/public/${slug}/rsvp/confirmation`,
        body: { confirmation },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    const { container } = renderApp(`/event/${slug}/rsvp`);
    await screen.findByLabelText(/your full name/i);
    const form = fillValidForm(container);

    fireEvent.submit(form);

    expect(await screen.findByText(/almost yours/i)).toBeTruthy();

    const rsvpCall = mock.mock.calls.find((call) => {
      const init = (call[1] ?? {}) as RequestInit;
      const url = new URL(String(call[0]));
      return (init.method ?? "GET").toUpperCase() === "POST" && url.pathname.endsWith("/rsvp");
    });
    const body = JSON.parse(String((rsvpCall?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      primaryGuestName: "Ada Lovelace",
      primaryGuestEmail: "ada@example.com",
      attendanceIntent: "ATTENDING",
    });
  });

  it("keeps the form and shows an error when submission fails", async () => {
    const mock = createFetchMock(rsvpRoutes([
      { method: "POST", path: `/api/events/public/${slug}/rsvp`, status: 500, body: { message: "Could not submit" } },
    ]));
    vi.stubGlobal("fetch", mock);

    const { container } = renderApp(`/event/${slug}/rsvp`);
    await screen.findByLabelText(/your full name/i);
    const form = fillValidForm(container);

    fireEvent.submit(form);

    expect(await screen.findByText("Could not submit")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send my rsvp/i })).toBeTruthy();
  });

  it("explains when this device has already replied", async () => {
    const mock = createFetchMock(rsvpRoutes([
      {
        method: "POST",
        path: `/api/events/public/${slug}/rsvp`,
        status: 409,
        body: { message: "An RSVP has already been made for this event on this device." },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    const { container } = renderApp(`/event/${slug}/rsvp`);
    await screen.findByLabelText(/your full name/i);
    const form = fillValidForm(container);

    fireEvent.submit(form);

    expect(await screen.findByText(/already replied/i)).toBeTruthy();
  });

  it("shows a clear error when the group exceeds remaining capacity", async () => {
    const mock = createFetchMock(rsvpRoutes([
      {
        method: "POST",
        path: `/api/events/public/${slug}/rsvp`,
        status: 409,
        body: { message: "There are not enough guest spaces for this group." },
      },
    ]));
    vi.stubGlobal("fetch", mock);

    const { container } = renderApp(`/event/${slug}/rsvp`);
    await screen.findByLabelText(/your full name/i);
    const form = fillValidForm(container);

    fireEvent.submit(form);

    expect(await screen.findByText(/not enough guest spaces/i)).toBeTruthy();
  });

  it("shows the closed state when the RSVP deadline has passed", async () => {
    const mock = createFetchMock(rsvpRoutes([], makePublicEvent({ rsvpDeadline: "2026-11-19T22:59:59.000Z" })));
    vi.stubGlobal("fetch", mock);

    renderApp(`/event/${slug}/rsvp`);

    expect(await screen.findByText(/rsvp window closed/i)).toBeTruthy();
  });
});