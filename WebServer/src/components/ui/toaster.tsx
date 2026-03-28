"use client";

import { Toast } from "./toast";
import { useToast } from "./use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:px-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="ecc-toast-wrapper"
          >
            <Toast
              title={t.title}
              description={t.description}
              actionLabel={t.actionLabel}
              state={t.state}
              onAction={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
              onClose={() => dismiss(t.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

