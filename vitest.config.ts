import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
    testTimeout: 15000,
    env: {
      VITE_API_BASE_URL: "http://localhost:4000",
    },
  },
});