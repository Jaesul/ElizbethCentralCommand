"use client";

import { Bean, Hand } from "lucide-react";
import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex max-w-5xl items-center px-4 py-4 xl:max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-2xl font-bold tracking-tight transition hover:opacity-80"
        >
          <span className="inline-flex items-center gap-1.5 text-primary">
            <Bean className="h-5 w-5" />
            <Hand className="h-5 w-5" />
          </span>
          <span>Bean Pounder</span>
        </Link>
      </nav>
    </header>
  );
}
