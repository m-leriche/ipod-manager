import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { DiscoverSettings } from "./DiscoverSettings";

describe("DiscoverSettings", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_discover_enabled") return true;
      return undefined;
    });
  });

  it("renders the toggle once loaded", async () => {
    render(<DiscoverSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("discover-toggle")).toBeInTheDocument();
    });
    expect((screen.getByTestId("discover-toggle") as HTMLInputElement).checked).toBe(true);
  });

  it("saves the toggle via the backend", async () => {
    render(<DiscoverSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("discover-toggle")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("discover-toggle"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_discover_enabled", { enabled: false });
    });
  });
});
