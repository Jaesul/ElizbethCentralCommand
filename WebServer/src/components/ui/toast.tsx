import { X } from "lucide-react";
import { cn } from "~/lib/utils";

interface ToastProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  state?: "open" | "closed";
}

export function Toast({ title, description, actionLabel, onAction, onClose, state = "open" }: ToastProps) {
  return (
    <div
      className={cn(
        "ecc-toast pointer-events-auto w-full max-w-sm overflow-hidden rounded-md border bg-background shadow-lg",
        "flex flex-col gap-2 p-3 text-sm"
      )}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          {title ? <div className="font-semibold">{title}</div> : null}
          {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {actionLabel && onAction && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center rounded-md border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

