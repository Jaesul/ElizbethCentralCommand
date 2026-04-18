"use client";

import Link from "next/link";
import { Coffee, FlaskConical, List } from "lucide-react";
import { BeanPounderLogo } from "~/components/BeanPounderLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import type { DashboardSection } from "./types";

const nav: { id: DashboardSection; label: string; icon: typeof Coffee }[] = [
  { id: "brew", label: "Brew", icon: FlaskConical },
  { id: "beans", label: "Beans", icon: Coffee },
  { id: "profiles", label: "Profiles", icon: List },
];

interface DashboardSidebarProps {
  active: DashboardSection;
  onSelect: (section: DashboardSection) => void;
}

export function DashboardSidebar({ active, onSelect }: DashboardSidebarProps) {
  return (
    <Sidebar variant="inset" className="md:!h-full">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2"
        >
          <BeanPounderLogo className="aspect-[54/24] h-6 w-auto shrink-0 text-sidebar-foreground" aria-hidden />
          <span className="truncate">Bean Pounder</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    type="button"
                    isActive={active === id}
                    onClick={() => onSelect(id)}
                    tooltip={label}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
