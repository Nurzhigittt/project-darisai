import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

let queuedCloseEvents: Array<() => void>;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeEach(() => {
  queuedCloseEvents = [];
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      // The HTML closing algorithm queues close after removing open. Keep
      // delivery explicit so the regression does not depend on timer speed.
      queuedCloseEvents.push(() => this.dispatchEvent(new Event("close")));
    },
  });
});

afterEach(() => {
  for (const [name, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function deliverCloseEvents() {
  const events = queuedCloseEvents.splice(0);
  act(() => { events.forEach((dispatch) => dispatch()); });
}

function ControlledDialog({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const requestClose = () => { onClose(); setOpen(false); };
  return <>
    <button onClick={() => setOpen(true)}>Open confirmation</button>
    <Dialog open={open} title="Confirm permission" onClose={requestClose}>
      <button onClick={requestClose}>Cancel permission</button>
      <button>Confirm permission</button>
    </Dialog>
  </>;
}

describe("Dialog native close events", () => {
  it("keeps a reopened confirmation and its focus when the preceding close event arrives", () => {
    const onClose = vi.fn();
    render(<ControlledDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel permission" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(queuedCloseEvents).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm permission" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm permission" });
    confirm.focus();
    deliverCloseEvents();

    expect(dialog).toHaveAttribute("open");
    expect(confirm).toHaveFocus();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not send a second close request when syncing a closed parent state", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open title="Permission" onClose={onClose} />);
    rerender(<Dialog open={false} title="Permission" onClose={onClose} />);
    deliverCloseEvents();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still reports a native close that was not requested by the parent", () => {
    const onClose = vi.fn();
    render(<ControlledDialog onClose={onClose} />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    act(() => dialog.close());
    deliverCloseEvents();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps cancellation controlled so a busy parent can refuse it", () => {
    const onClose = vi.fn();
    render(<Dialog open title="Saving permission" onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("open");
    expect(queuedCloseEvents).toHaveLength(0);
  });
});
