import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("renders menu items", () => {
    render(
      <ContextMenu
        x={100}
        y={200}
        items={[
          { label: "Filter out", onClick: vi.fn() },
          { label: "Copy path", onClick: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Filter out")).toBeInTheDocument();
    expect(screen.getByText("Copy path")).toBeInTheDocument();
  });

  it("calls onClick and onClose when item is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={200} items={[{ label: "Filter out", onClick }]} onClose={onClose} />);
    await user.click(screen.getByText("Filter out"));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={200} items={[{ label: "Filter out", onClick: vi.fn() }]} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
