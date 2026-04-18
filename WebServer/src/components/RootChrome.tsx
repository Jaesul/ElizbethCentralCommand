"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "~/components/AppNav";
import { TooltipProvider } from "~/components/ui/tooltip";

export function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideTopNav = pathname === "/";

  return (
    <TooltipProvider delayDuration={0}>
      {!hideTopNav ? <AppNav /> : null}
      {children}
    </TooltipProvider>
  );
}
