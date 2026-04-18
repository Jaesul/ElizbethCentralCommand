export const DASHBOARD_SECTIONS = ["brew", "beans", "profiles"] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export function isDashboardSection(value: string | null | undefined): value is DashboardSection {
  return typeof value === "string" && DASHBOARD_SECTIONS.includes(value as DashboardSection);
}
