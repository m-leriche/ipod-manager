import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProfileSelector } from "./ProfileSelector";

const PROFILES = [
  { name: "My iPod", source_path: null, target_path: null, exclusions: ["Podcasts"] },
  { name: "Backup", source_path: null, target_path: null, exclusions: [] },
];

const defaults = {
  profiles: PROFILES,
  activeProfile: null,
  onSwitch: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  onToggleFilters: vi.fn(),
  filterCount: 0,
};

describe("ProfileSelector", () => {
  it("renders profile dropdown with None selected by default", () => {
    render(<ProfileSelector {...defaults} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("");
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows profile names in dropdown", () => {
    render(<ProfileSelector {...defaults} />);
    expect(screen.getByText("My iPod")).toBeInTheDocument();
    expect(screen.getByText("Backup")).toBeInTheDocument();
  });

  it("calls onSwitch when selection changes", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<ProfileSelector {...defaults} onSwitch={onSwitch} />);
    await user.selectOptions(screen.getByRole("combobox"), "My iPod");
    expect(onSwitch).toHaveBeenCalledWith("My iPod");
  });

  it("shows create form when + is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...defaults} />);
    await user.click(screen.getByTitle("Create profile"));
    expect(screen.getByPlaceholderText("Profile name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onCreate when name is entered and Save is clicked", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProfileSelector {...defaults} onCreate={onCreate} />);
    await user.click(screen.getByTitle("Create profile"));
    await user.type(screen.getByPlaceholderText("Profile name"), "New Profile");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onCreate).toHaveBeenCalledWith("New Profile");
  });

  it("calls onCreate on Enter key", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProfileSelector {...defaults} onCreate={onCreate} />);
    await user.click(screen.getByTitle("Create profile"));
    await user.type(screen.getByPlaceholderText("Profile name"), "New Profile{Enter}");
    expect(onCreate).toHaveBeenCalledWith("New Profile");
  });

  it("closes form on Cancel", async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...defaults} />);
    await user.click(screen.getByTitle("Create profile"));
    expect(screen.getByPlaceholderText("Profile name")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Profile name")).not.toBeInTheDocument();
  });

  it("shows error when profile name already exists", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProfileSelector {...defaults} onCreate={onCreate} />);
    await user.click(screen.getByTitle("Create profile"));
    await user.type(screen.getByPlaceholderText("Profile name"), "My iPod");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("A profile with this name already exists")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("disables Save when name is empty", async () => {
    const user = userEvent.setup();
    render(<ProfileSelector {...defaults} />);
    await user.click(screen.getByTitle("Create profile"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows delete and filters buttons when profile is active", () => {
    render(<ProfileSelector {...defaults} activeProfile={PROFILES[0]} filterCount={1} />);
    expect(screen.getByTitle("Delete profile")).toBeInTheDocument();
    expect(screen.getByText("Filters (1)")).toBeInTheDocument();
  });

  it("hides delete and filters buttons when no profile is active", () => {
    render(<ProfileSelector {...defaults} />);
    expect(screen.queryByTitle("Delete profile")).not.toBeInTheDocument();
    expect(screen.queryByText(/Filters/)).not.toBeInTheDocument();
  });

  it("calls onDelete after confirmation when delete button is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ProfileSelector {...defaults} activeProfile={PROFILES[0]} onDelete={onDelete} />);
    await user.click(screen.getByTitle("Delete profile"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("My iPod");
  });

  it("calls onToggleFilters when Filters button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleFilters = vi.fn();
    render(<ProfileSelector {...defaults} activeProfile={PROFILES[0]} onToggleFilters={onToggleFilters} />);
    await user.click(screen.getByText(/Filters/));
    expect(onToggleFilters).toHaveBeenCalled();
  });
});
