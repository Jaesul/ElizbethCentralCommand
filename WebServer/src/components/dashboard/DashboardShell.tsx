"use client";

import type { CSSProperties, ReactNode } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardSection } from "./types";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

interface DashboardShellProps {
  active: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  headerTitle: string;
  headerDescription?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  active,
  onSectionChange,
  headerTitle,
  headerDescription,
  headerActions,
  children,
}: DashboardShellProps) {
  const style = {
    "--sidebar-width": "calc(var(--spacing) * 56)",
    "--header-height": "3.5rem",
  } as CSSProperties;

  return (
    <SidebarProvider
      className="flex !h-full !min-h-0 w-full overflow-hidden rounded-2xl border border-sidebar-border/60 shadow-sm"
      style={style}
    >
      <DashboardSidebar active={active} onSelect={onSectionChange} />
      <SidebarInset className="flex min-h-0 flex-col overflow-hidden bg-muted/30 md:peer-data-[variant=inset]:shadow-none">
        <DashboardHeader title={headerTitle} description={headerDescription} actions={headerActions} />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
