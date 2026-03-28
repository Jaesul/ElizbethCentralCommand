import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex max-w-5xl items-center gap-6 px-4 py-4 xl:max-w-6xl">
        <Link href="/" className="focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded">
          <h1 className="text-xl font-bold tracking-tight">ECC</h1>
        </Link>
        <Link
          href="/testing"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Testing
        </Link>
      </nav>
    </header>
  );
}
