import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error("kaboom");
  return <div>all good</div>;
}

function Harness() {
  const [fail, setFail] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setFail(false)}>fix</button>
      <ErrorBoundary>
        <Boom fail={fail} />
      </ErrorBoundary>
    </div>
  );
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });

  it("shows a recoverable error screen when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Harness />);
    expect(screen.getByText(/we couldn't/i)).toBeTruthy();
    expect(screen.getByText("Technical details")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to gather/i })).toBeTruthy();
  });

  it("recovers when Try again is clicked after the child is fixed", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Harness />);
    expect(screen.getByText(/we couldn't/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "fix" }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("all good")).toBeTruthy();
    expect(screen.queryByText(/we couldn't/i)).toBeNull();
  });
});