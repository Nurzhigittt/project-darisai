"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type ToastTone = "info" | "success" | "error";
type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastValue = {
  push: (toast: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 5_000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-surface p-4 shadow-soft",
              item.tone === "error" ? "border-ripple-warm/60" : "border-border",
            )}
          >
            {item.tone === "success" ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 text-positive" />
            ) : item.tone === "error" ? (
              <XCircle aria-hidden className="mt-0.5 size-5 text-ripple-warm" />
            ) : (
              <Info aria-hidden className="mt-0.5 size-5 text-primary" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-1 text-sm text-muted">{item.description}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
