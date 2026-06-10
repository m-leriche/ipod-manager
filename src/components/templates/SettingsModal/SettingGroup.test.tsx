import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingGroup, SettingToggle } from "./SettingGroup";

describe("SettingGroup", () => {
  it("renders title, description, and children", () => {
    render(
      <SettingGroup title="My Group" description="Group description">
        <span>child content</span>
      </SettingGroup>,
    );
    expect(screen.getByText("My Group")).toBeInTheDocument();
    expect(screen.getByText("Group description")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});

describe("SettingToggle", () => {
  it("renders label and hint, and reports changes", () => {
    const onChange = vi.fn();
    render(<SettingToggle label="My toggle" hint="A hint" checked={false} onChange={onChange} testId="my-toggle" />);
    expect(screen.getByText("My toggle")).toBeInTheDocument();
    expect(screen.getByText("A hint")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("my-toggle"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
