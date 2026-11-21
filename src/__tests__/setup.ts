import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement matchMedia; the theme provider uses it when toggling.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// Ensure the API client has a base URL even if the test env does not define one.
const env = import.meta.env as unknown as Record<string, unknown>;
if (!env.VITE_API_BASE_URL) {
  env.VITE_API_BASE_URL = "http://localhost:4000";
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});