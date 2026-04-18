"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type LucideIconProps = ComponentProps<LucideIcon>;

/**
 * Wraps a Lucide icon with suppressHydrationWarning on the root SVG.
 * Browser extensions (e.g. Dark Reader) inject data/style attrs into stroke SVGs
 * before React hydrates, which otherwise triggers false-positive hydration errors.
 */
export function SafeLucide({ icon: Icon, ...props }: { icon: LucideIcon } & LucideIconProps) {
  return <Icon suppressHydrationWarning {...props} />;
}
