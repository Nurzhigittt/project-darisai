"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "right" | "bottom";
};

export function Sheet({ open, onClose, title, children, side = "right" }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-0 max-h-none border-border bg-surface p-0 text-foreground shadow-soft",
        "backdrop:bg-[var(--scrim)]",
        side === "right"
          ? "ml-auto h-dvh w-[min(92vw,440px)] rounded-l-3xl border-l"
          : "mt-auto h-auto max-h-[85dvh] w-full rounded-t-3xl border-t",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <IconButton label="Close" onClick={onClose}>
          <X aria-hidden className="size-5" />
        </IconButton>
      </div>
      <div className="overflow-y-auto p-6">{children}</div>
    </dialog>
  );
}
