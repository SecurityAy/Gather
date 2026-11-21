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

function dashboardRoutes(): FetchRoute[] {
  return [
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    { method: "GET", path: "/api/events", body: eventsResponse([makeEvent({ id: "ev1", title: "Graduation 2026" })]) },
  ];
}

describe("ThemeProvider", () => {
  it("toggles the theme and persists the choice", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard");
    await screen.findAllByText(/graduation 2026/i);

    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("gather.theme")).toBe("dark");
  });

  it("applies a stored dark preference on load", async () => {
    localStorage.setItem("gather.theme", "dark");
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard");
    await screen.findAllByText(/graduation 2026/i);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light theme/i })).toBeTruthy();
  });
});

describe("SettingsPage", () => {
  it("disables controls that the API does not support", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/settings");

    expect((await screen.findByRole("button", { name: /change password/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^manage$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: /email notifications unavailable/i }) as HTMLInputElement).disabled).toBe(true);
  });

  it("switches theme from the appearance options", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/settings");
    await screen.findByRole("button", { name: /^dark$/i });

    fireEvent.click(screen.getByRole("button", { name: /^dark$/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("ProfilePage", () => {
  it("disables profile editing until the API supports it", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/profile");

    expect((await screen.findByRole("button", { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("EventsPage", () => {
  it("lists events and filters by search", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/events");
    expect(await screen.findByRole("heading", { name: /graduation 2026/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/search events/i), { target: { value: "zzz" } });
    expect(screen.queryByRole("heading", { name: /graduation 2026/i })).toBeNull();
  });
});

describe("GalleryPage", () => {
  it("shows the gallery manager with a publish summary", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/events/ev1/gallery");

    expect(await screen.findByRole("heading", { name: /graduation memories/i })).toBeTruthy();
    expect(screen.getByText(/0 of 0 photos published/i)).toBeTruthy();
  });
});

describe("NotFoundPage", () => {
  it("shows a recoverable page for unknown routes", async () => {
    vi.stubGlobal("fetch", createFetchMock([]));
    renderApp("/this-route-does-not-exist");
    expect(await screen.findByText(/we can't find/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to your dashboard/i })).toBeTruthy();
  });
});