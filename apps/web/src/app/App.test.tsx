import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App.js";

describe("App", () => {
  it("renders so the toolchain (Vite + React + Vitest + Testing Library) is exercised", () => {
    render(<App />);
    expect(screen.getByText("workout LAB")).toBeInTheDocument();
  });
});
