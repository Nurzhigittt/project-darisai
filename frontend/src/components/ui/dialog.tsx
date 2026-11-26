"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  closeLabel = "Close",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pendingControlledCloses = useRef(0);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      // close() queues its native event. The parent has already closed this
      // cycle, so that event must not close a subsequently reopened dialog.
      pendingControlledCloses.current += 1;
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        if (pendingControlledCloses.current > 0) {
          pendingControlledCloses.current -= 1;
          return;
        }
        // A native close from outside this controlled effect still notifies
        // the parent, unless its event belongs to an already reopened cycle.
        if (!event.currentTarget.open) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(92vw,520px)] rounded-3xl border border-border bg-surface p-0 text-foreground shadow-soft",
        "backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="app-dialog-heading mb-5 flex items-start justify-between gap-4 border-b border-border p-6">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-xl font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-2 break-words text-sm leading-6 text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton label={closeLabel} onClick={onClose} className="-mr-2 -mt-2">
          <X aria-hidden className="size-5" />
        </IconButton>
      </div>
      {children ? <div className="px-6 pb-2">{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-3 border-t border-border p-6">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
