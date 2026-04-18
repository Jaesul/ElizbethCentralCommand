import { ProfilesHomePage } from "~/components/ProfilesHomePage";

/**
 * Home is the dashboard: shadcn Sidebar uses `position: fixed` for the rail, which
 * escapes normal flow and anchors to the viewport unless a descendant has a transform
 * (new containing block). translateZ(0) keeps fixed sidebar + inset inside this max width.
 * Outer element is a div because SidebarInset already renders `<main>`.
 */
export default function HomePage() {
  return (
    <div
      className="relative mx-auto h-screen w-full max-w-6xl overflow-hidden bg-background [transform:translateZ(0)] xl:max-w-7xl"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
    >
      <ProfilesHomePage />
    </div>
  );
}
