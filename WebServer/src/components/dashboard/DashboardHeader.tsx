"use client";

import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";

interface DashboardHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function DashboardHeader({ title, description, actions }: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h1 className="truncate text-lg font-semibold leading-none">{title}</h1>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
