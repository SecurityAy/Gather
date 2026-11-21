import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Scanner from "../Scanner";

const h = vi.hoisted(() => ({
  shouldThrow: false,
  decoded: null as ((text: string) => void) | null,
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;

    async start(_config: unknown, _fps: unknown, onSuccess: (text: string) => void): Promise<void> {
      if (h.shouldThrow) throw new Error("Camera access denied");
      this.isScanning = true;
      h.decoded = onSuccess;
    }

    async stop(): Promise<void> {
      this.isScanning = false;
    }
  },
}));

beforeEach(() => {
  h.shouldThrow = false;
  h.decoded = null;
});

describe("Scanner", () => {
  it("shows the idle state with an Open camera action", () => {
    render(<Scanner onScan={() => undefined} />);
    expect(screen.getByText(/place qr code in the frame/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /open camera/i })).toBeTruthy();
  });

  it("shows a fallback when camera access is unavailable", async () => {
    h.shouldThrow = true;
    render(<Scanner onScan={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));

    expect(await screen.findByText(/camera access isn't available/i)).toBeTruthy();
  });

  it("reports a decoded QR code only once", async () => {
    const onScan = vi.fn();
    render(<Scanner onScan={onScan} />);

    fireEvent.click(screen.getByRole("button", { name: /open camera/i }));
    expect(await screen.findByText(/camera is ready/i)).toBeTruthy();

    act(() => {
      h.decoded?.("TOKEN-1");
      h.decoded?.("TOKEN-1");
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("TOKEN-1");
  });
});