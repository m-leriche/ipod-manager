import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UndoProvider, useUndo } from "./UndoContext";
import type { UndoEntry } from "./UndoContext";

const Pusher = ({ entries }: { entries: UndoEntry[] }) => {
  const { push } = useUndo();
  return <button onClick={() => entries.forEach(push)}>push</button>;
};

const setup = (entries: UndoEntry[]) => {
  render(
    <UndoProvider>
      <Pusher entries={entries} />
      <input aria-label="field" />
    </UndoProvider>,
  );
  fireEvent.click(screen.getByText("push"));
};

const cmdZ = (target: Element | Window = window) => fireEvent.keyDown(target, { code: "KeyZ", metaKey: true });

describe("UndoContext", () => {
  it("runs the pushed undo on Cmd+Z", async () => {
    const undo = vi.fn(() => Promise.resolve());
    setup([{ label: "File away", undo }]);

    cmdZ();

    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
  });

  it("pops entries in LIFO order", async () => {
    const order: string[] = [];
    const entry = (label: string): UndoEntry => ({
      label,
      undo: () => {
        order.push(label);
        return Promise.resolve();
      },
    });
    setup([entry("first"), entry("second")]);

    cmdZ();
    await waitFor(() => expect(order).toEqual(["second"]));
    cmdZ();
    await waitFor(() => expect(order).toEqual(["second", "first"]));
  });

  it("does nothing when the stack is empty", () => {
    setup([]);
    expect(() => cmdZ()).not.toThrow();
  });

  it("ignores Cmd+Z while typing in an input", async () => {
    const undo = vi.fn(() => Promise.resolve());
    setup([{ label: "File away", undo }]);

    cmdZ(screen.getByLabelText("field"));

    await Promise.resolve();
    expect(undo).not.toHaveBeenCalled();
  });

  it("ignores Cmd+Shift+Z", () => {
    const undo = vi.fn(() => Promise.resolve());
    setup([{ label: "File away", undo }]);

    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });

    expect(undo).not.toHaveBeenCalled();
  });

  it("throws when useUndo is used outside the provider", () => {
    const Naked = () => {
      useUndo();
      return null;
    };
    expect(() => render(<Naked />)).toThrow("useUndo must be used within UndoProvider");
  });
});
