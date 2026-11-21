import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../api/client";
import { createFetchMock, eventsResponse, renderApp, testUser } from "./test-utils";
import type { FetchRoute } from "./test-utils";

beforeEach(() => {
  localStorage.clear();
  clearAccessToken();
});

function routes(...extra: FetchRoute[]): FetchRoute[] {
  return [
    ...extra,
    { method: "GET", path: "/api/auth/me", body: { user: testUser } },
    { method: "GET", path: "/api/events", body: eventsResponse([]) },
  ];
}

describe("RequireAuth", () => {
  it("redirects unauthenticated visitors to the login screen", async () => {
    vi.stubGlobal("fetch", createFetchMock(routes()));
    renderApp("/dashboard");
    expect(await screen.findByRole("button", { name: /^sign in$/i })).toBeTruthy();
  });

  it("shows a loading state while the session is being checked", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/me")) return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    }));
    renderApp("/dashboard");
    expect(await screen.findByText(/checking your gather account/i)).toBeTruthy();
  });

  it("shows a recoverable error when the session cannot be verified", async () => {
    setAccessToken("test-token");
    vi.stubGlobal("fetch", createFetchMock(routes({
      method: "GET",
      path: "/api/auth/me",
      status: 500,
      body: { message: "Could not reach Gather." },
    })));
    renderApp("/dashboard");
    expect(await screen.findByText(/we couldn't/i)).toBeTruthy();
    expect(await screen.findByText("Could not reach Gather.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in again/i })).toBeTruthy();
  });
});

describe("AuthPage", () => {
  it("signs in with valid credentials and leaves the login screen", async () => {
    vi.stubGlobal("fetch", createFetchMock(routes({
      method: "POST",
      path: "/api/auth/login",
      body: { user: testUser, token: "token-1" },
    })));
    renderApp("/login");

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/email address/i)).toBeNull());
  });

  it("shows the API error when credentials are rejected", async () => {
    vi.stubGlobal("fetch", createFetchMock(routes({
      method: "POST",
      path: "/api/auth/login",
      status: 401,
      body: { message: "Invalid email or password." },
    })));
    renderApp("/login");

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
  });

  it("blocks signup when the passwords do not match", async () => {
    vi.stubGlobal("fetch", createFetchMock(routes()));
    renderApp("/signup");

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password124" } });
    fireEvent.click(screen.getByRole("button", { name: /create my account/i }));

    expect(await screen.findByText(/those passwords don't match/i)).toBeTruthy();
  });

  it("requires a first and last name on signup", async () => {
    vi.stubGlobal("fetch", createFetchMock(routes()));
    renderApp("/signup");

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /create my account/i }));

    expect(await screen.findByText(/enter your first and last name/i)).toBeTruthy();
  });
});