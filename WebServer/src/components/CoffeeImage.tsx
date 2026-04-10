"use client";

import { Coffee } from "lucide-react";

import { cn } from "~/lib/utils";

interface CoffeeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}

export function CoffeeImage({
  src,
  alt,
  className,
  iconClassName,
}: CoffeeImageProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      <Coffee className={cn("h-8 w-8", iconClassName)} />
    </div>
  );
}
