import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, clearEtagCache, getCachedPage, setAccessToken } from "../api/client";
import { createFetchMock, jsonResponse, testUser } from "./test-utils";

function lastCall(mock: ReturnType<typeof createFetchMock>) {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  const init = call[1] ?? {};
  return {
    url: new URL(String(call[0])),
    method: (init.method ?? "GET").toUpperCase(),
    headers: new Headers(init.headers),
    body: init.body,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("api client", () => {
  it("returns parsed JSON for a successful request", async () => {
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", body: { user: testUser } }]);
    vi.stubGlobal("fetch", mock);

    const result = await api.me();

    expect(result.user.email).toBe(testUser.email);
    const call = lastCall(mock);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/api/auth/me");
  });

  it("adds the bearer token when signed in", async () => {
    setAccessToken("token-123");
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", body: { user: testUser } }]);
    vi.stubGlobal("fetch", mock);

    await api.me();

    expect(lastCall(mock).headers.get("authorization")).toBe("Bearer token-123");
  });

  it("omits the authorization header when signed out", async () => {
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", body: { user: testUser } }]);
    vi.stubGlobal("fetch", mock);

    await api.me();

    expect(lastCall(mock).headers.get("authorization")).toBeNull();
  });

  it("sends and persists a x-device-id header", async () => {
    vi.resetModules();
    localStorage.clear();
    const { api: freshApi } = await import("../api/client");
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", body: { user: testUser } }]);
    vi.stubGlobal("fetch", mock);

    await freshApi.me();

    const deviceId = lastCall(mock).headers.get("x-device-id");
    expect(deviceId).toMatch(/^web-/);
    expect(localStorage.getItem("gather.device-id")).toBe(deviceId);
  });

  it("reuses a stored device id from localStorage", async () => {
    localStorage.setItem("gather.device-id", "web-stored-123");
    vi.resetModules();
    const { api: freshApi } = await import("../api/client");
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", body: { user: testUser } }]);
    vi.stubGlobal("fetch", mock);

    await freshApi.me();

    expect(lastCall(mock).headers.get("x-device-id")).toBe("web-stored-123");
  });

  it("surfaces validation details from an error response", async () => {
    const mock = createFetchMock([
      { method: "GET", path: "/api/auth/me", status: 400, body: { message: "Bad input", errors: [{ path: "email", message: "Invalid" }] } },
    ]);
    vi.stubGlobal("fetch", mock);

    const error = await api.me().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.message).toBe("Bad input");
    expect(apiError.details?.[0]).toEqual({ path: "email", message: "Invalid" });
  });

  it("clears the token and emits an event on 401", async () => {
    setAccessToken("token-123");
    const mock = createFetchMock([{ method: "GET", path: "/api/auth/me", status: 401, body: { message: "Unauthorized" } }]);
    vi.stubGlobal("fetch", mock);
    const listener = vi.fn();
    window.addEventListener("gather:unauthorized", listener);

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem("gather.access-token")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("gather:unauthorized", listener);
  });

  it("reports a friendly error when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));

    await expect(api.me()).rejects.toMatchObject({
      status: 0,
      message: "Could not reach Gather. Check the API connection and try again.",
    });
  });

  it("retries a 5xx public request once without the device header", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { event: {} }));
    vi.stubGlobal("fetch", mock);

    await api.publicEvent("graduation-2026");

    expect(mock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers((mock.mock.calls[0][1] as RequestInit).headers);
    const secondHeaders = new Headers((mock.mock.calls[1][1] as RequestInit).headers);
    expect(firstHeaders.get("x-device-id")).toMatch(/^web-/);
    expect(secondHeaders.has("x-device-id")).toBe(false);
  });

  it("does not retry a 5xx response for non-public endpoints", async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse(500, { message: "boom" }));
    vi.stubGlobal("fetch", mock);

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("calls the correct endpoints and bodies for critical flows", async () => {
    const mock = createFetchMock([
      { method: "POST", path: /.*/, body: {} },
      { method: "PATCH", path: /.*/, body: {} },
      { method: "PUT", path: /.*/, body: {} },
      { method: "GET", path: /.*/, body: {} },
    ]);
    vi.stubGlobal("fetch", mock);

    await api.submitRsvp("graduation-2026", {
      primaryGuestName: "Ada",
      primaryGuestEmail: "ada@example.com",
      primaryGuestPhone: "080",
      attendanceIntent: "ATTENDING",
    });
    let call = lastCall(mock);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/api/events/public/graduation-2026/rsvp");
    expect(JSON.parse(String(call.body))).toMatchObject({ primaryGuestEmail: "ada@example.com" });

    await api.checkInTicket("ev1", "TOKEN-1");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/tickets/checkin");
    expect(JSON.parse(String(call.body))).toEqual({ eventId: "ev1", qrToken: "TOKEN-1" });

    await api.issueEventTickets("ev1");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/tickets/issue");
    expect(call.method).toBe("POST");

    await api.approveOrganiserRsvp("ev1", "reg1");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/rsvps/reg1/approve");

    await api.rejectOrganiserRsvp("ev1", "reg1");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/rsvps/reg1/reject");

    await api.getRsvpConfirmation("graduation-2026", "CONFIRM");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/public/graduation-2026/rsvp/confirmation");
    expect(JSON.parse(String(call.body))).toEqual({ token: "CONFIRM" });

    await api.listEventAttendees("ev1", 2, 20);
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/attendees");
    expect(call.url.search).toContain("page=2");
    expect(call.url.search).toContain("pageSize=20");

    await api.bulkApproveOrganiserRsvps("ev1", ["reg1"]);
    call = lastCall(mock);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/api/events/ev1/rsvps/bulk-approve");
    expect(JSON.parse(String(call.body))).toEqual({ registrationIds: ["reg1"] });

    await api.bulkDeclineOrganiserRsvps("ev1", ["reg1"]);
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/rsvps/bulk-decline");

    await api.listEventTickets("ev1", 1, 20);
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/tickets");

    await api.listEventAudit("ev1", 1, 20);
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/events/ev1/audit");

    await api.resendTicketEmail("ev1", "t1");
    call = lastCall(mock);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/api/events/ev1/tickets/t1/resend-email");

    await api.forgotPassword("ada@example.com");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/auth/forgot-password");
    expect(JSON.parse(String(call.body))).toEqual({ email: "ada@example.com" });

    await api.resetPassword("tok", "password123");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/auth/reset-password");
    expect(JSON.parse(String(call.body))).toEqual({ token: "tok", password: "password123" });

    await api.changePassword("old", "new");
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/auth/change-password");

    await api.updateProfile({ firstName: "Grace" });
    call = lastCall(mock);
    expect(call.method).toBe("PATCH");
    expect(call.url.pathname).toBe("/api/auth/me");

    await api.getPreferences();
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/me/preferences");

    await api.updatePreferences({ emailNotifications: false });
    call = lastCall(mock);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/api/me/preferences");

    await api.getDataExport();
    call = lastCall(mock);
    expect(call.url.pathname).toBe("/api/me/data-export");
  });

  it("reuses a cached ETag and skips the body on a 304", async () => {
    clearEtagCache();
    setAccessToken("token-123");
    const body = { attendees: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

    const mock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("If-None-Match") === '"abc123"') {
        return new Response(null, { status: 304 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"abc123"' },
      });
    });
    vi.stubGlobal("fetch", mock);

    const first = await getCachedPage<typeof body>("/api/events/ev1/attendees?page=1&pageSize=20");
    expect(first.notModified).toBe(false);
    expect(first.etag).toBe('"abc123"');
    expect(first.data.attendees).toEqual([]);

    const second = await getCachedPage<typeof body>("/api/events/ev1/attendees?page=1&pageSize=20");
    expect(second.notModified).toBe(true);
    expect(second.etag).toBe('"abc123"');

    const secondHeaders = new Headers((mock.mock.calls[1][1] ?? {}).headers);
    expect(secondHeaders.get("If-None-Match")).toBe('"abc123"');
  });
});