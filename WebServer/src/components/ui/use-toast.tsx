"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface Toast extends ToastOptions {
  id: string;
  state: "open" | "closed";
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_EXIT_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, state: "closed" } : t))
    );

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = options.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => {
      // replace existing toast with same id
      const existingIndex = prev.findIndex((t) => t.id === id);
      const next = [...prev];
      const nextToast: Toast = { ...options, id, state: "open" };
      if (existingIndex >= 0) {
        next[existingIndex] = nextToast;
        return next;
      }
      return [...prev, nextToast];
    });

    if (options.durationMs != null && options.durationMs > 0) {
      window.setTimeout(() => {
        dismiss(id);
      }, options.durationMs);
    }
  }, [dismiss]);

  const value: ToastContextValue = {
    toasts,
    toast,
    dismiss,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

