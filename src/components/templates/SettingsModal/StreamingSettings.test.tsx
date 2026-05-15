import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { StreamingSettings } from "./StreamingSettings";

const mockInvoke = vi.mocked(invoke);

const defaultStatus = {
  enabled: true,
  port: 4533,
  username: "admin",
  urls: [{ label: "Local WiFi", url: "http://192.168.2.176:4533" }],
};

describe("StreamingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(defaultStatus);
  });

  it("shows loading state then server status", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText("Running on port 4533")).toBeInTheDocument();
    });
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("shows server URLs with copy buttons", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText("http://192.168.2.176:4533")).toBeInTheDocument();
    });
    expect(screen.getByText("Local WiFi")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("shows multiple URLs when available", async () => {
    mockInvoke.mockResolvedValue({
      ...defaultStatus,
      urls: [
        { label: "Local WiFi", url: "http://192.168.2.176:4533" },
        { label: "Tailscale", url: "http://100.64.0.1:4533" },
      ],
    });
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText("Local WiFi")).toBeInTheDocument();
    });
    expect(screen.getByText("Tailscale")).toBeInTheDocument();
    expect(screen.getByText("http://100.64.0.1:4533")).toBeInTheDocument();
  });

  it("shows message when no URLs detected", async () => {
    mockInvoke.mockResolvedValue({ ...defaultStatus, urls: [] });
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText(/No network interfaces detected/)).toBeInTheDocument();
    });
  });

  it("shows change credentials button", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    });
  });

  it("opens credential editing form", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("change-credentials"));
    expect(screen.getByTestId("username-input")).toBeInTheDocument();
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
    expect(screen.getByTestId("save-credentials")).toBeInTheDocument();
  });

  it("disables save when fields are empty", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("change-credentials"));
    const saveBtn = screen.getByTestId("save-credentials");
    // Password is empty, so save should be disabled
    expect(saveBtn).toBeDisabled();
  });

  it("saves credentials and shows saved indicator", async () => {
    mockInvoke.mockResolvedValue(defaultStatus);
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("change-credentials"));

    fireEvent.change(screen.getByTestId("username-input"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByTestId("password-input"), { target: { value: "newpass" } });
    fireEvent.click(screen.getByTestId("save-credentials"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_subsonic_credentials", {
        username: "newuser",
        password: "newpass",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("saved-indicator")).toBeInTheDocument();
    });
  });

  it("cancels editing and resets form", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("change-credentials"));
    fireEvent.change(screen.getByTestId("username-input"), { target: { value: "changed" } });
    fireEvent.click(screen.getByText("Cancel"));

    // Should be back to non-editing state
    expect(screen.getByTestId("change-credentials")).toBeInTheDocument();
    expect(screen.queryByTestId("username-input")).not.toBeInTheDocument();
  });

  it("copies URL to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Copy"));

    expect(writeText).toHaveBeenCalledWith("http://192.168.2.176:4533");
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("shows green status dot when enabled", async () => {
    render(<StreamingSettings />);
    await waitFor(() => {
      expect(screen.getByText("Running on port 4533")).toBeInTheDocument();
    });
    const dot = screen.getByText("Running on port 4533").parentElement?.querySelector(".bg-green-500");
    expect(dot).toBeInTheDocument();
  });
});
