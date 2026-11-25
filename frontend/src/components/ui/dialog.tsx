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
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(92vw,520px)] rounded-3xl border border-border bg-surface p-0 text-foreground shadow-soft",
        "backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 p-6 pb-4">
        <div>
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-2">
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
