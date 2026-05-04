import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LastfmSettings } from "./LastfmSettings";

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockCancelConnect = vi.fn();
const mockSetScrobbleEnabled = vi.fn();

let mockState = {
  connected: false,
  username: null as string | null,
  scrobbleEnabled: true,
  queueCount: 0,
  connecting: false,
};

vi.mock("../../../contexts/LastfmContext", () => ({
  useLastfmState: () => mockState,
  useLastfm: () => ({
    connect: mockConnect,
    cancelConnect: mockCancelConnect,
    disconnect: mockDisconnect,
    setScrobbleEnabled: mockSetScrobbleEnabled,
  }),
}));

describe("LastfmSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      connected: false,
      username: null,
      scrobbleEnabled: true,
      queueCount: 0,
      connecting: false,
    };
  });

  it("shows connect button when disconnected", () => {
    render(<LastfmSettings />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
  });

  it("calls connect when button clicked", () => {
    render(<LastfmSettings />);
    fireEvent.click(screen.getByText("Connect"));
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("shows connecting state with cancel button", () => {
    mockState = { ...mockState, connecting: true };
    render(<LastfmSettings />);
    expect(screen.getByText(/Waiting for authorization/)).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls cancelConnect when cancel clicked during auth", () => {
    mockState = { ...mockState, connecting: true };
    render(<LastfmSettings />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockCancelConnect).toHaveBeenCalledOnce();
  });

  it("shows connected state with username", () => {
    mockState = { ...mockState, connected: true, username: "testuser" };
    render(<LastfmSettings />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("shows scrobble toggle when connected", () => {
    mockState = { ...mockState, connected: true, username: "testuser" };
    render(<LastfmSettings />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(screen.getByText("Enable scrobbling")).toBeInTheDocument();
  });

  it("calls setScrobbleEnabled when toggle changed", () => {
    mockState = { ...mockState, connected: true, username: "testuser" };
    render(<LastfmSettings />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mockSetScrobbleEnabled).toHaveBeenCalledWith(false);
  });

  it("calls disconnect when button clicked", () => {
    mockState = { ...mockState, connected: true, username: "testuser" };
    render(<LastfmSettings />);
    fireEvent.click(screen.getByText("Disconnect"));
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it("shows queue count when there are pending scrobbles", () => {
    mockState = { ...mockState, connected: true, username: "testuser", queueCount: 5 };
    render(<LastfmSettings />);
    expect(screen.getByText("5 scrobbles queued for submission")).toBeInTheDocument();
  });

  it("hides queue count when zero", () => {
    mockState = { ...mockState, connected: true, username: "testuser", queueCount: 0 };
    render(<LastfmSettings />);
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument();
  });

  it("shows singular scrobble text for count of 1", () => {
    mockState = { ...mockState, connected: true, username: "testuser", queueCount: 1 };
    render(<LastfmSettings />);
    expect(screen.getByText("1 scrobble queued for submission")).toBeInTheDocument();
  });
});
