import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  it("loads and saves the email notification preference", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      ...dashboardRoutes(),
      { method: "GET", path: "/api/me/preferences", body: { preferences: { emailNotifications: true } } },
      { method: "PUT", path: "/api/me/preferences", body: { preferences: { emailNotifications: false } } },
    ]));
    renderApp("/dashboard/settings");

    const toggle = await screen.findByRole("checkbox", { name: /email notifications/i });
    fireEvent.click(toggle);

    await waitFor(() => expect((screen.getByRole("checkbox", { name: /email notifications/i }) as HTMLInputElement).checked).toBe(false));
  });

  it("switches theme from the appearance options", async () => {
    vi.stubGlobal("fetch", createFetchMock(dashboardRoutes()));
    renderApp("/dashboard/settings");
    await screen.findByRole("button", { name: /^dark$/i });

    fireEvent.click(screen.getByRole("button", { name: /^dark$/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("exports the account data as a JSON download", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      ...dashboardRoutes(),
      { method: "GET", path: "/api/me/preferences", body: { preferences: { emailNotifications: true } } },
      {
        method: "GET",
        path: "/api/me/data-export",
        body: {
          exportedAt: "2026-11-21T00:00:00.000Z",
          user: testUser,
          events: [],
          registrations: [],
        },
      },
    ]));
    renderApp("/dashboard/settings");
    await screen.findByRole("checkbox", { name: /email notifications/i });

    let downloadName = "";
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
      });
    // jsdom does not implement these two URL helpers.
    const objectUrls: string[] = [];
    const revokedUrls: string[] = [];
    (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => {
      const url = `blob:gather-${objectUrls.length}`;
      objectUrls.push(url);
      return url;
    };
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
    };

    fireEvent.click(screen.getByRole("button", { name: /^manage$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /export my data/i }));

    await waitFor(() => expect(downloadName).toMatch(/^gather-data-export-.*\.json$/));
    expect(objectUrls.length).toBeGreaterThan(0);
    expect(revokedUrls).toContain(objectUrls[0]);

    anchorClickSpy.mockRestore();
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  });

  it("changes the password through the API", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      ...dashboardRoutes(),
      { method: "GET", path: "/api/me/preferences", body: { preferences: { emailNotifications: true } } },
      { method: "POST", path: "/api/auth/change-password", body: { message: "Your password has been updated." } },
    ]));
    renderApp("/dashboard/settings");
    await screen.findByRole("checkbox", { name: /email notifications/i });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: "oldpassword" } });
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    expect(await screen.findByText(/your password was updated/i)).toBeTruthy();
  });
});

describe("ProfilePage", () => {
  it("saves updated profile details through the API", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      ...dashboardRoutes(),
      { method: "PATCH", path: "/api/auth/me", body: { user: { ...testUser, firstName: "Grace", lastName: "Hopper" } } },
    ]));
    renderApp("/dashboard/profile");
    await screen.findByLabelText(/first name/i);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Grace" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Hopper" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/your profile has been updated/i)).toBeTruthy();
  });

  it("shows the API error when the email is already taken", async () => {
    vi.stubGlobal("fetch", createFetchMock([
      ...dashboardRoutes(),
      { method: "PATCH", path: "/api/auth/me", status: 409, body: { message: "That email is already in use." } },
    ]));
    renderApp("/dashboard/profile");
    await screen.findByLabelText(/first name/i);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Grace" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("That email is already in use.")).toBeTruthy();
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