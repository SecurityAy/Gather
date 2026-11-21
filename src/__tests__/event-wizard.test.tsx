import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../api/client";
import { createFetchMock, eventsResponse, makeEvent, renderApp, testUser } from "./test-utils";
import type { FetchRoute } from "./test-utils";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearAccessToken();
  setAccessToken("test-token");
});

const draft = makeEvent({
  id: "ev1",
  title: "Graduation 2026",
  graduateName: "Ada Lovelace",
  institution: "University of Lagos",
  venueName: "Main Hall",
  venueAddress: "1 Road",
  eventStatus: "DRAFT",
});

function wizardRoutes(): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    { method: "GET", path: "/api/events", body: eventsResponse([draft]) },
    { method: "GET", path: "/api/events/ev1", body: { event: draft } },
    { method: "PATCH", path: "/api/events/ev1", body: { event: draft } },
    { method: "POST", path: "/api/events", body: { event: { ...draft, id: "ev-new", slug: "graduation-2026" } } },
    { method: "POST", path: "/api/events/ev-new/publish", body: { event: { ...draft, id: "ev-new", status: "Published" } } },
    { method: "POST", path: "/api/events/ev1/publish", body: { event: { ...draft, status: "Published" } } },
  ];
}

function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("EventWizard", () => {
  it("starts on the basics step and blocks continuing without a title", async () => {
    vi.stubGlobal("fetch", createFetchMock(wizardRoutes()));
    renderApp("/dashboard/events/create");

    expect(await screen.findByText(/start with the basics/i)).toBeTruthy();
    clickContinue();

    expect(await screen.findByText(/add an event title and choose a celebration type/i)).toBeTruthy();
    expect(screen.getByText(/start with the basics/i)).toBeTruthy();
  });

  it("advances through the steps when required fields are filled", async () => {
    vi.stubGlobal("fetch", createFetchMock(wizardRoutes()));
    renderApp("/dashboard/events/create");
    await screen.findByText(/start with the basics/i);

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Graduation 2026" } });
    fireEvent.change(screen.getByLabelText(/what are you celebrating/i), { target: { value: "Graduation Ceremony" } });
    clickContinue();

    expect(await screen.findByText(/tell us about you/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/institution/i), { target: { value: "University of Lagos" } });
    clickContinue();

    expect(await screen.findByText(/set the scene/i)).toBeTruthy();
  });

  it("prefills an existing event when editing", async () => {
    vi.stubGlobal("fetch", createFetchMock(wizardRoutes()));
    renderApp("/dashboard/events/ev1/edit");

    expect(await screen.findByDisplayValue("Graduation 2026")).toBeTruthy();
    expect(screen.getByText(/make a few changes/i)).toBeTruthy();
  });

  it("saves a draft and leaves the wizard", async () => {
    vi.stubGlobal("fetch", createFetchMock(wizardRoutes()));
    renderApp("/dashboard/events/create");
    await screen.findByText(/start with the basics/i);

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Graduation 2026" } });
    fireEvent.change(screen.getByLabelText(/what are you celebrating/i), { target: { value: "Graduation Ceremony" } });
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    expect(await screen.findByText(/all events/i)).toBeTruthy();
  });

  it("shows an error when saving fails", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      { method: "GET", path: "/api/auth/me", body: { user: testUser } },
      { method: "GET", path: "/api/events", body: eventsResponse([]) },
      { method: "POST", path: "/api/events", status: 500, body: { message: "Could not create the event." } },
    ]));
    renderApp("/dashboard/events/create");
    await screen.findByText(/start with the basics/i);

    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: "Graduation 2026" } });
    fireEvent.change(screen.getByLabelText(/what are you celebrating/i), { target: { value: "Graduation Ceremony" } });
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    expect(await screen.findByText("Could not create the event.")).toBeTruthy();
  });
});